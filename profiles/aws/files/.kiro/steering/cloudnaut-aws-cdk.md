---
inclusion: auto
name: cloudnaut-aws-cdk
description: Guidance for AWS infrastructure work. Use when a task involves AWS, CDK, CloudFormation, Terraform, IAM, VPC, Lambda, or any infrastructure-as-code change.
---
# AWS and CDK defaults

## Infrastructure as code

- Define infrastructure in code and change it through the project's existing stacks and constructs. Do not edit resources by hand.
- Grant the narrowest IAM permissions that work. Avoid wildcard actions and wildcard resources unless the service requires them, and say why.
- Take account IDs, Regions, and environment names from configuration or context. Never hard-code them.
- Give stateful resources (databases, buckets, queues, log groups) an explicit removal and retention policy, and call out any change that would replace one.
- Encrypt data at rest and in transit, and keep new resources private unless the task needs public access.

## Checks

- Run the project's synth, lint, and unit tests. Run `cdk diff` or the equivalent when credentials are available, and say when they are not.
- Review a finished change with the `review-aws-infra-change` skill.

## References

- For public AWS documentation, API behavior, and Regional availability, use the AWS Knowledge MCP server (`aws-knowledge-mcp`) when it is connected.
- Authentication is the developer's own. Do not ask for, store, or write credentials, and do not add them to project files.
