mod support;

use ente_wall::{OpenWallLinkCtxInput, WallLinkCtx};

use support::{auth, wall};

#[tokio::test]
#[ignore = "requires local Museum at ENTE_E2E_ENDPOINT or http://localhost:8080"]
async fn wall_bootstrap_posts_follow_share_and_link_suite() {
    let endpoint = support::endpoint();
    if !support::assert_server_or_skip(&endpoint, "wall rust e2e suite").await {
        return;
    }

    let owner = auth::create_account(
        &endpoint,
        support::unique_test_email("wall-owner"),
        support::unique_password("WallOwner"),
    )
    .await;
    let follower = auth::create_account(
        &endpoint,
        support::unique_test_email("wall-follower"),
        support::unique_password("WallFollower"),
    )
    .await;
    let outsider = auth::create_account(
        &endpoint,
        support::unique_test_email("wall-outsider"),
        support::unique_password("WallOutsider"),
    )
    .await;

    let owner_ctx = wall::open_ctx(&endpoint, &owner);
    let follower_ctx = wall::open_ctx(&endpoint, &follower);
    let outsider_ctx = wall::open_ctx(&endpoint, &outsider);

    let owner_slug = format!("owner-{}", owner.user_id);
    let follower_slug = format!("follower-{}", follower.user_id);
    let outsider_slug = format!("outsider-{}", outsider.user_id);

    let owner_profile = wall::profile_payload("Owner", "Owner bio");
    let owner_wall = owner_ctx
        .create_wall(&owner_slug, &owner_profile)
        .await
        .expect("owner wall creation failed");
    follower_ctx
        .create_wall(
            &follower_slug,
            &wall::profile_payload("Follower", "Follower bio"),
        )
        .await
        .expect("follower wall creation failed");
    outsider_ctx
        .create_wall(
            &outsider_slug,
            &wall::profile_payload("Outsider", "Outsider bio"),
        )
        .await
        .expect("outsider wall creation failed");

    let owned = owner_ctx
        .list_owned_walls()
        .await
        .expect("owned walls should load");
    assert_eq!(owned.len(), 1);
    assert_eq!(owned[0].wall_id, owner_wall.wall_id);

    let decrypted_profile = owner_ctx
        .get_wall_profile_decrypted(&owner_wall.wall_id, None)
        .await
        .expect("owner should decrypt profile");
    assert_eq!(decrypted_profile.profile, owner_profile);
    assert_eq!(decrypted_profile.wall_slug, owner_slug);

    wall::assert_http_status(
        outsider_ctx
            .get_wall_profile_raw(&owner_wall.wall_id, None)
            .await,
        403,
    );

    let updated_slug = format!("{owner_slug}-updated");
    owner_ctx
        .update_wall_slug(&owner_wall.wall_id, &updated_slug)
        .await
        .expect("slug update should succeed");
    let updated_profile = wall::profile_payload("Owner Updated", "Bio v2");
    owner_ctx
        .update_wall_profile(&owner_wall.wall_id, &updated_profile, None, false)
        .await
        .expect("profile update should succeed");
    let looked_up = outsider_ctx
        .lookup_wall_by_slug(&updated_slug)
        .await
        .expect("public slug lookup should succeed");
    assert_eq!(looked_up.wall_id, owner_wall.wall_id);
    assert_eq!(looked_up.wall_slug, updated_slug);

    let object = wall::fake_post_object("post-1");
    let (post_id, post_key) = owner_ctx
        .create_post(
            &owner_wall.wall_id,
            &[object],
            Some(br#"{"caption":"hello world"}"#),
            None,
        )
        .await
        .expect("post creation should succeed");
    let owner_post = owner_ctx
        .fetch_post_decrypted(post_id)
        .await
        .expect("owner should decrypt post");
    assert_eq!(
        owner_post.caption_plaintext.as_deref(),
        Some(br#"{"caption":"hello world"}"#.as_slice())
    );

    wall::assert_http_status(
        follower_ctx
            .get_wall_profile_raw(&owner_wall.wall_id, None)
            .await,
        403,
    );

    follower_ctx
        .request_follow_by_wall(&owner_wall.wall_id)
        .await
        .expect("follow request should succeed");
    let incoming = owner_ctx
        .list_incoming_follow_requests()
        .await
        .expect("incoming follow requests should load");
    assert_eq!(incoming.len(), 1);
    assert_eq!(incoming[0].wall_id, owner_wall.wall_id);
    owner_ctx
        .approve_follow_request(&incoming[0])
        .await
        .expect("follow approval should succeed");

    let shares = follower_ctx
        .list_follow_shares()
        .await
        .expect("follow shares should load");
    assert_eq!(shares.len(), 1);
    let decrypted_share = follower_ctx
        .decrypt_follow_share(&shares[0])
        .expect("follow share should decrypt");
    assert_eq!(decrypted_share.wall_id, owner_wall.wall_id);

    let hydrated = follower_ctx
        .hydrate_wall_keys()
        .await
        .expect("wall keys should hydrate");
    assert_eq!(hydrated.owned.len(), 1);
    assert_eq!(hydrated.followed.len(), 1);
    assert_eq!(hydrated.followed[0].wall_id, owner_wall.wall_id);

    let follower_profile = follower_ctx
        .get_wall_profile_decrypted(&owner_wall.wall_id, None)
        .await
        .expect("approved follower should decrypt profile");
    assert_eq!(follower_profile.profile, updated_profile);
    assert_eq!(follower_profile.wall_slug, updated_slug);

    let feed = follower_ctx
        .list_feed(None, Some(10))
        .await
        .expect("feed should load after follow approval");
    assert_eq!(feed.items.len(), 1);
    assert_eq!(feed.items[0].post_id, post_id);
    let feed_post = follower_ctx
        .decrypt_feed_item(&feed.items[0])
        .await
        .expect("feed item should decrypt");
    assert_eq!(
        feed_post.caption_plaintext.as_deref(),
        Some(br#"{"caption":"hello world"}"#.as_slice())
    );

    let liked = follower_ctx
        .like_post(post_id, true)
        .await
        .expect("liking post should succeed");
    assert!(liked.liked);
    let top_level = follower_ctx
        .create_comment(post_id, &post_key, b"looks great", None)
        .await
        .expect("comment creation should succeed");
    owner_ctx
        .create_comment(post_id, &post_key, b"thanks", Some(top_level.comment_id))
        .await
        .expect("reply creation should succeed");

    let comments = follower_ctx
        .list_comments(post_id, None, None)
        .await
        .expect("comments should load");
    assert_eq!(comments.comments.len(), 1);
    assert_eq!(comments.comments[0].replies.len(), 1);
    let parent = follower_ctx
        .decrypt_comment(&post_key, &comments.comments[0])
        .expect("parent comment should decrypt");
    let reply = follower_ctx
        .decrypt_comment(&post_key, &comments.comments[0].replies[0])
        .expect("reply comment should decrypt");
    assert_eq!(parent.plaintext, b"looks great");
    assert_eq!(reply.plaintext, b"thanks");

    wall::assert_http_status(outsider_ctx.fetch_post_decrypted(post_id).await, 403);

    let link = owner_ctx
        .create_wall_link(&owner_wall.wall_id)
        .await
        .expect("wall link should be created");
    let link_ctx = WallLinkCtx::open(OpenWallLinkCtxInput {
        base_url: endpoint.clone(),
        wall_username: link.wall_username.clone(),
        access_key: link.access_key.clone(),
        user_agent: Some("ente-e2e".to_string()),
        client_package: Some("io.ente.photos".to_string()),
        client_version: Some("ente-e2e".to_string()),
    })
    .await
    .expect("wall link should open");
    let link_profile = link_ctx
        .get_wall_profile_decrypted(None)
        .await
        .expect("link session should decrypt profile");
    assert_eq!(link_profile.profile, updated_profile);
    let link_posts = link_ctx
        .list_posts(None)
        .await
        .expect("link session should list posts");
    assert_eq!(link_posts.len(), 1);
    let link_post = link_ctx
        .decrypt_post(&link_posts[0])
        .await
        .expect("link session should decrypt post");
    assert_eq!(
        link_post.caption_plaintext.as_deref(),
        Some(br#"{"caption":"hello world"}"#.as_slice())
    );

    owner_ctx
        .delete_wall_link(&owner_wall.wall_id)
        .await
        .expect("wall link deletion should succeed");
    wall::assert_http_status(link_ctx.get_wall_profile_raw(None).await, 401);
}
