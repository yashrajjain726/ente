mod support;
#[path = "support/wall.rs"]
mod wall;

use ente_wall::{OpenWallLinkCtxInput, WallLinkCtx};

use support::auth;

#[tokio::test]
#[ignore = "requires local Museum at ENTE_E2E_ENDPOINT or http://localhost:8080"]
async fn wall_bootstrap_posts_friend_share_and_link_suite() {
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
    let friend = auth::create_account(
        &endpoint,
        support::unique_test_email("wall-friend"),
        support::unique_password("WallFriender"),
    )
    .await;
    let outsider = auth::create_account(
        &endpoint,
        support::unique_test_email("wall-outsider"),
        support::unique_password("WallOutsider"),
    )
    .await;

    let owner_ctx = wall::open_ctx(&endpoint, &owner);
    let friend_ctx = wall::open_ctx(&endpoint, &friend);
    let outsider_ctx = wall::open_ctx(&endpoint, &outsider);

    let owner_slug = format!("owner-{}", owner.user_id);
    let friend_slug = format!("friend-{}", friend.user_id);
    let outsider_slug = format!("outsider-{}", outsider.user_id);

    let owner_profile = wall::profile_payload("Owner", "Owner bio");
    let owner_wall = owner_ctx
        .create_wall(&owner_slug, &owner_profile)
        .await
        .expect("owner wall creation failed");
    let friend_profile_payload = wall::profile_payload("Friender", "Friender bio");
    let friend_wall = friend_ctx
        .create_wall(&friend_slug, &friend_profile_payload)
        .await
        .expect("friend wall creation failed");
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

    let post_key = owner_ctx.generate_post_key();
    let object = owner_ctx
        .upload_post_asset(&post_key, b"wall e2e encrypted post asset", Some(0))
        .await
        .expect("post asset upload should succeed");
    let (post_id, _post_key) = owner_ctx
        .create_post(
            &owner_wall.wall_id,
            &[object],
            Some(br#"{"caption":"hello world"}"#),
            Some(&post_key),
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
        friend_ctx
            .get_wall_profile_raw(&owner_wall.wall_id, None)
            .await,
        403,
    );

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
    friend_ctx
        .add_friend_from_link(&link_ctx)
        .await
        .expect("friend add should succeed");

    let shares = friend_ctx
        .list_friend_shares()
        .await
        .expect("friend shares should load");
    assert_eq!(shares.len(), 1);
    let decrypted_share = friend_ctx
        .decrypt_friend_share(&shares[0])
        .expect("friend share should decrypt");
    assert_eq!(decrypted_share.wall_id, owner_wall.wall_id);

    let hydrated = friend_ctx
        .hydrate_wall_keys()
        .await
        .expect("wall keys should hydrate");
    assert_eq!(hydrated.owned.len(), 1);
    assert_eq!(hydrated.friends.len(), 1);
    assert_eq!(hydrated.friends[0].wall_id, owner_wall.wall_id);

    let friend_profile = friend_ctx
        .get_wall_profile_decrypted(&owner_wall.wall_id, None)
        .await
        .expect("approved friend should decrypt profile");
    assert_eq!(friend_profile.profile, updated_profile);
    assert_eq!(friend_profile.wall_slug, updated_slug);

    let owner_view_of_friend = owner_ctx
        .get_wall_profile_decrypted(&friend_wall.wall_id, None)
        .await
        .expect("approved owner should decrypt friend profile");
    assert_eq!(owner_view_of_friend.profile, friend_profile_payload);
    assert_eq!(owner_view_of_friend.wall_slug, friend_slug);

    let feed = friend_ctx
        .list_feed(None, Some(10))
        .await
        .expect("feed should load after friend approval");
    assert_eq!(feed.items.len(), 1);
    assert_eq!(feed.items[0].post_id, post_id);
    assert_eq!(feed.items[0].author.wall_id, owner_wall.wall_id);
    assert_eq!(feed.items[0].author.wall_slug, updated_slug);
    let feed_author_profile = friend_ctx
        .decrypt_actor_profile(&feed.items[0].author)
        .await
        .expect("friend should decrypt feed author profile");
    assert_eq!(
        feed_author_profile.as_deref(),
        Some(updated_profile.as_slice())
    );
    let feed_post = friend_ctx
        .decrypt_feed_item(&feed.items[0])
        .await
        .expect("feed item should decrypt");
    assert_eq!(
        feed_post.caption_plaintext.as_deref(),
        Some(br#"{"caption":"hello world"}"#.as_slice())
    );

    let liked = friend_ctx
        .like_post(post_id, true)
        .await
        .expect("liking post should succeed");
    assert!(liked.liked);
    let likers = owner_ctx
        .list_post_likers(post_id, None, Some(10))
        .await
        .expect("post likers should load");
    assert_eq!(likers.likers.len(), 1);
    assert_eq!(likers.likers[0].actor.wall_id, friend_wall.wall_id);
    assert_eq!(likers.likers[0].actor.wall_slug, friend_slug);
    let liker_profile = owner_ctx
        .decrypt_actor_profile(&likers.likers[0].actor)
        .await
        .expect("owner should decrypt liker profile");
    assert_eq!(
        liker_profile.as_deref(),
        Some(friend_profile_payload.as_slice())
    );

    wall::assert_http_status(outsider_ctx.fetch_post_decrypted(post_id).await, 403);

    let link_profile = link_ctx
        .get_wall_profile_decrypted(None)
        .await
        .expect("link session should decrypt profile");
    assert_eq!(link_profile.profile, updated_profile);
    let link_posts = link_ctx
        .list_posts(None, None)
        .await
        .expect("link session should list posts");
    assert_eq!(link_posts.items.len(), 1);
    assert_eq!(link_posts.items[0].author.wall_id, owner_wall.wall_id);
    let link_author_profile = link_ctx
        .decrypt_actor_profile(&link_posts.items[0].author)
        .await
        .expect("link should decrypt owner actor profile");
    assert_eq!(
        link_author_profile.as_deref(),
        Some(updated_profile.as_slice())
    );
    assert!(link_posts.next_cursor.is_empty());
    let link_post = link_ctx
        .decrypt_post(&link_posts.items[0])
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

#[tokio::test]
#[ignore = "requires local Museum at ENTE_E2E_ENDPOINT or http://localhost:8080"]
async fn wall_rotation_history_refresh_and_link_suite() {
    let endpoint = support::endpoint();
    if !support::assert_server_or_skip(&endpoint, "wall rotation e2e suite").await {
        return;
    }

    let owner = auth::create_account(
        &endpoint,
        support::unique_test_email("wall-rotation-owner"),
        support::unique_password("WallRotationOwner"),
    )
    .await;
    let friend = auth::create_account(
        &endpoint,
        support::unique_test_email("wall-rotation-friend"),
        support::unique_password("WallRotationFriender"),
    )
    .await;

    let owner_ctx = wall::open_ctx(&endpoint, &owner);
    let friend_ctx = wall::open_ctx(&endpoint, &friend);

    let owner_slug = format!("rotation-owner-{}", owner.user_id);
    let friend_slug = format!("rotation-friend-{}", friend.user_id);
    let profile_v1 = wall::profile_payload("Rotation Owner", "Profile v1");
    let owner_wall = owner_ctx
        .create_wall(&owner_slug, &profile_v1)
        .await
        .expect("owner wall creation failed");
    friend_ctx
        .create_wall(
            &friend_slug,
            &wall::profile_payload("Rotation Friender", "Friender bio"),
        )
        .await
        .expect("friend wall creation failed");

    let post_key_v1 = owner_ctx.generate_post_key();
    let object_v1 = owner_ctx
        .upload_post_asset(&post_key_v1, b"rotation post asset v1", Some(0))
        .await
        .expect("v1 post asset upload should succeed");
    let (post_id_v1, _post_key_v1) = owner_ctx
        .create_post(
            &owner_wall.wall_id,
            &[object_v1],
            Some(br#"{"caption":"version one"}"#),
            Some(&post_key_v1),
        )
        .await
        .expect("v1 post creation should succeed");

    let link = owner_ctx
        .create_wall_link(&owner_wall.wall_id)
        .await
        .expect("rotation wall link should be created");
    let link_ctx = WallLinkCtx::open(OpenWallLinkCtxInput {
        base_url: endpoint.clone(),
        wall_username: link.wall_username.clone(),
        access_key: link.access_key.clone(),
        user_agent: Some("ente-e2e".to_string()),
        client_package: Some("io.ente.photos".to_string()),
        client_version: Some("ente-e2e".to_string()),
    })
    .await
    .expect("rotation wall link should open");
    friend_ctx
        .add_friend_from_link(&link_ctx)
        .await
        .expect("friend add should succeed");

    let friend_profile_v1 = friend_ctx
        .get_wall_profile_decrypted(&owner_wall.wall_id, Some(owner_wall.key_version))
        .await
        .expect("friend should decrypt v1 profile");
    assert_eq!(friend_profile_v1.profile, profile_v1);

    let profile_v2 = wall::profile_payload("Rotation Owner", "Profile v2");
    let rotated_wall = owner_ctx
        .rotate_wall_key(&owner_wall.wall_id, Some(&profile_v2))
        .await
        .expect("wall rotation should succeed");
    assert_eq!(rotated_wall.key_version, owner_wall.key_version + 1);

    let refreshed = owner_ctx
        .refresh_friend_shares(&owner_wall.wall_id)
        .await
        .expect("friend shares should refresh");
    assert_eq!(refreshed, 1);
    let refreshed_shares = friend_ctx
        .list_friend_shares()
        .await
        .expect("refreshed friend shares should load");
    assert_eq!(refreshed_shares.len(), 1);
    assert_eq!(refreshed_shares[0].key_version, rotated_wall.key_version);

    let post_key_v2 = owner_ctx.generate_post_key();
    let object_v2 = owner_ctx
        .upload_post_asset(&post_key_v2, b"rotation post asset v2", Some(0))
        .await
        .expect("v2 post asset upload should succeed");
    let (post_id_v2, _post_key_v2) = owner_ctx
        .create_post(
            &owner_wall.wall_id,
            &[object_v2],
            Some(br#"{"caption":"version two"}"#),
            Some(&post_key_v2),
        )
        .await
        .expect("v2 post creation should succeed");

    let owner_profile_v1 = owner_ctx
        .get_wall_profile_decrypted(&owner_wall.wall_id, Some(owner_wall.key_version))
        .await
        .expect("owner should decrypt historical profile");
    assert_eq!(owner_profile_v1.profile, profile_v1);
    let owner_profile_v2 = owner_ctx
        .get_wall_profile_decrypted(&owner_wall.wall_id, None)
        .await
        .expect("owner should decrypt current profile");
    assert_eq!(owner_profile_v2.profile, profile_v2);
    let friend_profile_v2 = friend_ctx
        .get_wall_profile_decrypted(&owner_wall.wall_id, None)
        .await
        .expect("friend should decrypt current profile");
    assert_eq!(friend_profile_v2.profile, profile_v2);

    let feed = friend_ctx
        .list_feed(None, Some(10))
        .await
        .expect("feed should load after rotation");
    let feed_v1 = feed
        .items
        .iter()
        .find(|item| item.post_id == post_id_v1)
        .expect("v1 post should remain in friend feed");
    let feed_v2 = feed
        .items
        .iter()
        .find(|item| item.post_id == post_id_v2)
        .expect("v2 post should appear in friend feed");
    let friend_post_v1 = friend_ctx
        .decrypt_feed_item(feed_v1)
        .await
        .expect("friend should decrypt v1 post after rotation");
    assert_eq!(
        friend_post_v1.caption_plaintext.as_deref(),
        Some(br#"{"caption":"version one"}"#.as_slice())
    );
    let friend_post_v2 = friend_ctx
        .decrypt_feed_item(feed_v2)
        .await
        .expect("friend should decrypt v2 post after rotation");
    assert_eq!(
        friend_post_v2.caption_plaintext.as_deref(),
        Some(br#"{"caption":"version two"}"#.as_slice())
    );

    let link = owner_ctx
        .create_wall_link(&owner_wall.wall_id)
        .await
        .expect("wall link should be created after rotation");
    let link_ctx = WallLinkCtx::open(OpenWallLinkCtxInput {
        base_url: endpoint.clone(),
        wall_username: link.wall_username.clone(),
        access_key: link.access_key.clone(),
        user_agent: Some("ente-e2e".to_string()),
        client_package: Some("io.ente.photos".to_string()),
        client_version: Some("ente-e2e".to_string()),
    })
    .await
    .expect("wall link should open after rotation");

    let link_profile_v1 = link_ctx
        .get_wall_profile_decrypted(Some(owner_wall.key_version))
        .await
        .expect("link should decrypt historical profile");
    assert_eq!(link_profile_v1.profile, profile_v1);
    let link_profile_v2 = link_ctx
        .get_wall_profile_decrypted(None)
        .await
        .expect("link should decrypt current profile");
    assert_eq!(link_profile_v2.profile, profile_v2);

    let link_posts = link_ctx
        .list_posts(None, Some(10))
        .await
        .expect("link should list posts after rotation");
    let link_post_v1 = link_posts
        .items
        .iter()
        .find(|item| item.post_id == post_id_v1)
        .expect("link should list v1 post");
    let link_post_v2 = link_posts
        .items
        .iter()
        .find(|item| item.post_id == post_id_v2)
        .expect("link should list v2 post");
    let link_decrypted_v1 = link_ctx
        .decrypt_post(link_post_v1)
        .await
        .expect("link should decrypt v1 post after rotation");
    assert_eq!(
        link_decrypted_v1.caption_plaintext.as_deref(),
        Some(br#"{"caption":"version one"}"#.as_slice())
    );
    let link_decrypted_v2 = link_ctx
        .decrypt_post(link_post_v2)
        .await
        .expect("link should decrypt v2 post after rotation");
    assert_eq!(
        link_decrypted_v2.caption_plaintext.as_deref(),
        Some(br#"{"caption":"version two"}"#.as_slice())
    );
}
