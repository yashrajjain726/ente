// S3 service style operations for Wasabi specific compliance functionality.
//
// This file contains various service operations for interacting with the Wasabi
// compliance functions. These are based on standard operations templates taken
// from the source code in the AWS S3 Go SDK (v1), and modified to use the
// custom payloads expected by Wasabi.
//
// # Wasabi Compliance
//
// Wasabi supports a compliance policy that prevents the deletion of objects.
//
// Compliance is different from the object lock setting for a bucket, and is
// mutually exclusive with it - a particular bucket can have only one of these
// enabled at a time.
//
// There are compliance settings on a bucket level, which apply the policy that
// is applied to all objects added to that bucket. In addition, there are also
// compliance settings at the object level.
package wasabi

import (
	"github.com/aws/aws-sdk-go/aws/awsutil"
	"github.com/aws/aws-sdk-go/aws/request"
	"github.com/aws/aws-sdk-go/service/s3"
)

func newRequest(c *s3.S3, op *request.Operation, params, data interface{}) *request.Request {
	req := c.NewRequest(op, params, data)
	return req
}

const opGetBucketCompliance = "GetBucketCompliance"

func GetBucketCompliance(c *s3.S3, input *GetBucketComplianceInput) (*GetBucketComplianceOutput, error) {
	req, out := GetBucketComplianceRequest(c, input)
	return out, req.Send()
}

func GetBucketComplianceRequest(c *s3.S3, input *GetBucketComplianceInput) (req *request.Request, output *GetBucketComplianceOutput) {
	op := &request.Operation{
		Name:       opGetBucketCompliance,
		HTTPMethod: "GET",
		HTTPPath:   "/{Bucket}?compliance",
	}

	if input == nil {
		input = &GetBucketComplianceInput{}
	}

	output = &GetBucketComplianceOutput{}
	req = newRequest(c, op, input, output)
	return
}

type GetBucketComplianceInput struct {
	_ struct{} `locationName:"GetBucketComplianceRequest" type:"structure"`

	Bucket *string `location:"uri" locationName:"Bucket" type:"string" required:"true"`
}

func (s GetBucketComplianceInput) String() string {
	return awsutil.Prettify(s)
}

func (s GetBucketComplianceInput) GoString() string {
	return s.String()
}

func (s *GetBucketComplianceInput) Validate() error {
	invalidParams := request.ErrInvalidParams{Context: "GetBucketComplianceInput"}
	if s.Bucket == nil {
		invalidParams.Add(request.NewErrParamRequired("Bucket"))
	}
	if s.Bucket != nil && len(*s.Bucket) < 1 {
		invalidParams.Add(request.NewErrParamMinLen("Bucket", 1))
	}

	if invalidParams.Len() > 0 {
		return invalidParams
	}
	return nil
}

func (s *GetBucketComplianceInput) SetBucket(v string) *GetBucketComplianceInput {
	s.Bucket = &v
	return s
}

type GetBucketComplianceOutput struct {
	_ struct{} `type:"structure"`

	Status *string `type:"string" enum:"BucketComplianceStatus"`

	LockTime *string `type:"string"`

	RetentionDays *int64 `type:"integer"`

	ConditionalHold *bool `type:"boolean"`

	DeleteAfterRetention *bool `type:"boolean"`
}

func (s GetBucketComplianceOutput) String() string {
	return awsutil.Prettify(s)
}

func (s GetBucketComplianceOutput) GoString() string {
	return s.String()
}

func (s *GetBucketComplianceOutput) SetStatus(v string) *GetBucketComplianceOutput {
	s.Status = &v
	return s
}

func (s *GetBucketComplianceOutput) SetLockTime(v string) *GetBucketComplianceOutput {
	s.LockTime = &v
	return s
}

func (s *GetBucketComplianceOutput) SetRetentionDays(v int64) *GetBucketComplianceOutput {
	s.RetentionDays = &v
	return s
}

func (s *GetBucketComplianceOutput) SetConditionalHold(v bool) *GetBucketComplianceOutput {
	s.ConditionalHold = &v
	return s
}

func (s *GetBucketComplianceOutput) SetDeleteAfterRetention(v bool) *GetBucketComplianceOutput {
	s.DeleteAfterRetention = &v
	return s
}

const (
	BucketComplianceStatusEnabled = "enabled"

	BucketComplianceStatusDisabled = "disabled"
)

func BucketComplianceStatus_Values() []string {
	return []string{
		BucketComplianceStatusEnabled,
		BucketComplianceStatusDisabled,
	}
}

const opPutBucketCompliance = "PutBucketCompliance"

func PutBucketCompliance(c *s3.S3, input *PutBucketComplianceInput) (*PutBucketComplianceOutput, error) {
	req, out := PutBucketComplianceRequest(c, input)
	return out, req.Send()
}

func PutBucketComplianceRequest(c *s3.S3, input *PutBucketComplianceInput) (req *request.Request, output *PutBucketComplianceOutput) {
	op := &request.Operation{
		Name:       opPutBucketCompliance,
		HTTPMethod: "PUT",
		HTTPPath:   "/{Bucket}?compliance",
	}

	if input == nil {
		input = &PutBucketComplianceInput{}
	}

	output = &PutBucketComplianceOutput{}
	req = newRequest(c, op, input, output)
	return
}

type PutBucketComplianceInput struct {
	_ struct{} `locationName:"PutBucketComplianceRequest" type:"structure" payload:"BucketComplianceConfiguration"`

	Bucket *string `location:"uri" locationName:"Bucket" type:"string" required:"true"`

	BucketComplianceConfiguration *BucketComplianceConfiguration `locationName:"BucketComplianceConfiguration" type:"structure" required:"true"`
}

type BucketComplianceConfiguration struct {
	_ struct{} `type:"structure"`

	// The compliance state of the bucket.
	//
	// Either "enabled" or "disabled" to turn compliance on and off,
	// respectively. Enabling will immediately apply to all objects in the
	// bucket.
	Status *string `type:"string" enum:"BucketComplianceStatus"`

	// The time at which the compliance settings are "locked".
	//
	// The time at which the compliance settings are "locked"— the settings
	// cannot be reduced by any API call. Once the settings are locked, they
	// cannot be unlocked without the intervention of Wasabi Customer Support.
	// The lock time allows you to support two use cases:
	//
	// 1) testing that your software works properly before locking the
	//    compliance feature; or
	//
	// 2) never locking which means that data can be deleted with an additional
	//    step of an administrator turning compliance off.
	//
	// The lock time parameter may be:
	//
	// - an ISO date (for example, 2016-11-07T15:08:05Z),
	//
	// - the string "now" to force immediate locking, or
	//
	// - the string "off" to not lock the compliance settings. This is the default.
	LockTime *string `type:"string"`

	// An integer for the minimum number of days that objects are always
	// retained after their creation date or release from conditional hold. You
	// can extend the retention date for any individual object, but may not
	// shorten the date. This parameter is always required.
	RetentionDays *int64 `type:"integer"`

	// A Boolean value indicating if newly created objects are placed on
	// conditional hold, meaning that they cannot be deleted until the
	// con­ditional hold is explicitly turned off. The default is false if this
	// parameter is not given. Note that this setting may be changed even after
	// the settings are locked.
	ConditionalHold *bool `type:"boolean"`

	// A Boolean value indicating if the object should be deleted automatically
	// at the end of the retention period. The default is to not delete objects
	// after the reten­tion period. Note that this setting may be changed even
	// after the settings are locked.
	DeleteAfterRetention *bool `type:"boolean"`
}

func (s PutBucketComplianceInput) String() string {
	return awsutil.Prettify(s)
}

func (s PutBucketComplianceInput) GoString() string {
	return s.String()
}

func (s *PutBucketComplianceInput) Validate() error {
	invalidParams := request.ErrInvalidParams{Context: "PutBucketComplianceInput"}
	if s.Bucket == nil {
		invalidParams.Add(request.NewErrParamRequired("Bucket"))
	}
	if s.Bucket != nil && len(*s.Bucket) < 1 {
		invalidParams.Add(request.NewErrParamMinLen("Bucket", 1))
	}
	if s.BucketComplianceConfiguration == nil {
		invalidParams.Add(request.NewErrParamRequired("BucketComplianceConfiguration"))
	}
	if s.BucketComplianceConfiguration != nil {
		if err := s.BucketComplianceConfiguration.Validate(); err != nil {
			invalidParams.AddNested("BucketComplianceConfiguration", err.(request.ErrInvalidParams))
		}
	}

	if invalidParams.Len() > 0 {
		return invalidParams
	}
	return nil
}

func (s *PutBucketComplianceInput) SetBucket(v string) *PutBucketComplianceInput {
	s.Bucket = &v
	return s
}

func (s *PutBucketComplianceInput) SetBucketComplianceConfiguration(v BucketComplianceConfiguration) *PutBucketComplianceInput {
	s.BucketComplianceConfiguration = &v
	return s
}

func (s BucketComplianceConfiguration) String() string {
	return awsutil.Prettify(s)
}

func (s BucketComplianceConfiguration) GoString() string {
	return s.String()
}

func (s *BucketComplianceConfiguration) Validate() error {
	invalidParams := request.ErrInvalidParams{Context: "BucketComplianceConfiguration"}
	if s.RetentionDays == nil {
		invalidParams.Add(request.NewErrParamRequired("RetentionDays"))
	}

	if invalidParams.Len() > 0 {
		return invalidParams
	}
	return nil
}

func (s *BucketComplianceConfiguration) SetStatus(v string) *BucketComplianceConfiguration {
	s.Status = &v
	return s
}

func (s *BucketComplianceConfiguration) SetLockTime(v string) *BucketComplianceConfiguration {
	s.LockTime = &v
	return s
}

func (s *BucketComplianceConfiguration) SetRetentionDays(v int64) *BucketComplianceConfiguration {
	s.RetentionDays = &v
	return s
}

func (s *BucketComplianceConfiguration) SetConditionalHold(v bool) *BucketComplianceConfiguration {
	s.ConditionalHold = &v
	return s
}

func (s *BucketComplianceConfiguration) SetDeleteAfterRetention(v bool) *BucketComplianceConfiguration {
	s.DeleteAfterRetention = &v
	return s
}

type PutBucketComplianceOutput struct {
	_ struct{} `type:"structure"`
}

func (s PutBucketComplianceOutput) String() string {
	return awsutil.Prettify(s)
}

func (s PutBucketComplianceOutput) GoString() string {
	return s.String()
}

const opGetObjectCompliance = "GetObjectCompliance"

func GetObjectCompliance(c *s3.S3, input *GetObjectComplianceInput) (*GetObjectComplianceOutput, error) {
	req, out := GetObjectComplianceRequest(c, input)
	return out, req.Send()
}

func GetObjectComplianceRequest(c *s3.S3, input *GetObjectComplianceInput) (req *request.Request, output *GetObjectComplianceOutput) {
	op := &request.Operation{
		Name:       opGetObjectCompliance,
		HTTPMethod: "GET",
		HTTPPath:   "/{Bucket}/{Key+}?compliance",
	}

	if input == nil {
		input = &GetObjectComplianceInput{}
	}

	output = &GetObjectComplianceOutput{}
	req = newRequest(c, op, input, output)
	return
}

type GetObjectComplianceInput struct {
	_ struct{} `locationName:"GetObjectComplianceRequest" type:"structure"`

	Bucket *string `location:"uri" locationName:"Bucket" type:"string" required:"true"`

	Key *string `location:"uri" locationName:"Key" min:"1" type:"string" required:"true"`
}

func (s GetObjectComplianceInput) String() string {
	return awsutil.Prettify(s)
}

func (s GetObjectComplianceInput) GoString() string {
	return s.String()
}

func (s *GetObjectComplianceInput) Validate() error {
	invalidParams := request.ErrInvalidParams{Context: "GetObjectComplianceInput"}
	if s.Bucket == nil {
		invalidParams.Add(request.NewErrParamRequired("Bucket"))
	}
	if s.Bucket != nil && len(*s.Bucket) < 1 {
		invalidParams.Add(request.NewErrParamMinLen("Bucket", 1))
	}
	if s.Key == nil {
		invalidParams.Add(request.NewErrParamRequired("Key"))
	}
	if s.Key != nil && len(*s.Key) < 1 {
		invalidParams.Add(request.NewErrParamMinLen("Key", 1))
	}

	if invalidParams.Len() > 0 {
		return invalidParams
	}
	return nil
}

func (s *GetObjectComplianceInput) SetBucket(v string) *GetObjectComplianceInput {
	s.Bucket = &v
	return s
}

func (s *GetObjectComplianceInput) SetKey(v string) *GetObjectComplianceInput {
	s.Key = &v
	return s
}

type GetObjectComplianceOutput struct {
	_ struct{} `type:"structure"`

	RetentionTime *string `type:"string"`

	ConditionalHold *bool `type:"boolean"`

	LegalHold *bool `type:"boolean"`

	SHA256 *string `type:"string"`
}

func (s GetObjectComplianceOutput) String() string {
	return awsutil.Prettify(s)
}

func (s GetObjectComplianceOutput) GoString() string {
	return s.String()
}

func (s *GetObjectComplianceOutput) SetRetentionTime(v string) *GetObjectComplianceOutput {
	s.RetentionTime = &v
	return s
}

func (s *GetObjectComplianceOutput) SetConditionalHold(v bool) *GetObjectComplianceOutput {
	s.ConditionalHold = &v
	return s
}

func (s *GetObjectComplianceOutput) SetLegalHold(v bool) *GetObjectComplianceOutput {
	s.LegalHold = &v
	return s
}

func (s *GetObjectComplianceOutput) SetSHA256(v string) *GetObjectComplianceOutput {
	s.SHA256 = &v
	return s
}

const opPutObjectCompliance = "PutObjectCompliance"

func PutObjectCompliance(c *s3.S3, input *PutObjectComplianceInput) (*PutObjectComplianceOutput, error) {
	req, out := PutObjectComplianceRequest(c, input)
	return out, req.Send()
}

func PutObjectComplianceRequest(c *s3.S3, input *PutObjectComplianceInput) (req *request.Request, output *PutObjectComplianceOutput) {
	op := &request.Operation{
		Name:       opPutObjectCompliance,
		HTTPMethod: "PUT",
		HTTPPath:   "/{Bucket}/{Key+}?compliance",
	}

	if input == nil {
		input = &PutObjectComplianceInput{}
	}

	output = &PutObjectComplianceOutput{}
	req = newRequest(c, op, input, output)
	return
}

type PutObjectComplianceInput struct {
	_ struct{} `locationName:"PutObjectComplianceRequest" type:"structure" payload:"ObjectComplianceConfiguration"`

	Bucket *string `location:"uri" locationName:"Bucket" type:"string" required:"true"`

	Key *string `location:"uri" locationName:"Key" min:"1" type:"string" required:"true"`

	ObjectComplianceConfiguration *ObjectComplianceConfiguration `locationName:"ObjectComplianceConfiguration" type:"structure" required:"true"`
}

type ObjectComplianceConfiguration struct {
	_ struct{} `type:"structure"`

	// An ISO time giving a new retention time for the object in which the
	// object cannot be deleted before this time. Note that the new retention
	// time must be past the reten­tion period given by the bucket policy or an
	// error is returned.
	RetentionTime *string `type:"string"`

	// A Boolean value "false" to release the object from the conditional hold
	// setting in the bucket policy. The retention period in days is started
	// from the point when the con­ditional hold is released. Once the
	// conditional hold is set false, it may not be returned to conditional
	// hold.
	ConditionalHold *bool `type:"boolean"`

	// A Boolean value "true" or "false" to set the legal hold status. When an
	// object has a legal hold status of true, the object cannot be deleted
	// regardless of the retention period.
	LegalHold *bool `type:"boolean"`
}

func (s PutObjectComplianceInput) String() string {
	return awsutil.Prettify(s)
}

func (s PutObjectComplianceInput) GoString() string {
	return s.String()
}

func (s *PutObjectComplianceInput) Validate() error {
	invalidParams := request.ErrInvalidParams{Context: "PutObjectComplianceInput"}
	if s.Bucket == nil {
		invalidParams.Add(request.NewErrParamRequired("Bucket"))
	}
	if s.Bucket != nil && len(*s.Bucket) < 1 {
		invalidParams.Add(request.NewErrParamMinLen("Bucket", 1))
	}
	if s.Key == nil {
		invalidParams.Add(request.NewErrParamRequired("Key"))
	}
	if s.Key != nil && len(*s.Key) < 1 {
		invalidParams.Add(request.NewErrParamMinLen("Key", 1))
	}
	if s.ObjectComplianceConfiguration == nil {
		invalidParams.Add(request.NewErrParamRequired("ObjectComplianceConfiguration"))
	}
	if s.ObjectComplianceConfiguration != nil {
		if err := s.ObjectComplianceConfiguration.Validate(); err != nil {
			invalidParams.AddNested("ObjectComplianceConfiguration", err.(request.ErrInvalidParams))
		}
	}

	if invalidParams.Len() > 0 {
		return invalidParams
	}
	return nil
}

func (s *PutObjectComplianceInput) SetBucket(v string) *PutObjectComplianceInput {
	s.Bucket = &v
	return s
}

func (s *PutObjectComplianceInput) SetKey(v string) *PutObjectComplianceInput {
	s.Key = &v
	return s
}

func (s ObjectComplianceConfiguration) String() string {
	return awsutil.Prettify(s)
}

func (s ObjectComplianceConfiguration) GoString() string {
	return s.String()
}

func (s *ObjectComplianceConfiguration) Validate() error {
	return nil
}

func (s *ObjectComplianceConfiguration) SetRetentionTime(v string) *ObjectComplianceConfiguration {
	s.RetentionTime = &v
	return s
}

func (s *ObjectComplianceConfiguration) SetConditionalHold(v bool) *ObjectComplianceConfiguration {
	s.ConditionalHold = &v
	return s
}

func (s *ObjectComplianceConfiguration) SetLegalHold(v bool) *ObjectComplianceConfiguration {
	s.LegalHold = &v
	return s
}

type PutObjectComplianceOutput struct {
	_ struct{} `type:"structure"`
}

func (s PutObjectComplianceOutput) String() string {
	return awsutil.Prettify(s)
}

func (s PutObjectComplianceOutput) GoString() string {
	return s.String()
}
