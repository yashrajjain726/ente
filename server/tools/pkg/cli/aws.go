package cli

import (
	"flag"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
)

func ParseAndCreateSession(endpointURL string, S3ForcePathStyle bool) (*session.Session, error) {
	logLevel := aws.LogDebugWithHTTPBody
	cliProfile := flag.String("profile", "AWS_PROFILE",
		"The profile to use from the S3 config file")
	cliEndpointURL := flag.String("endpoint-url", "",
		"The root URL of the S3 compatible API (excluding the bucket)")
	flag.Parse()

	profile := *cliProfile
	if profile == "" {
		profile = os.Getenv("AWS_PROFILE")
	}

	if *cliEndpointURL != "" {
		endpointURL = *cliEndpointURL
	}

	fmt.Printf("Using profile %s, endpoint %s\n", profile, endpointURL)

	sess, err := session.NewSessionWithOptions(session.Options{
		Profile: profile,
		// Needed to read region from .aws/profile
		SharedConfigState: session.SharedConfigEnable,
		Config: aws.Config{
			Endpoint:         aws.String(endpointURL),
			S3ForcePathStyle: aws.Bool(S3ForcePathStyle),
			LogLevel:         &logLevel,
		},
	})
	if err != nil {
		fmt.Printf("NewSessionWithOptions error: %s\n", err)
		return sess, err
	}

	return sess, err
}
