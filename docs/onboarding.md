# Onboarding

From a clean machine to a verified setup. You need Node.js 22 or newer and Git. The CLI never needs AWS access.

## 1. Get the tool at a release

```text
git clone https://github.com/cloudnautTechnologies/dev-setup.git
cd dev-setup
git fetch --tags
git checkout v0.1.0
node --version
```

Use the tag your project maintainer names. Opening this repository in Kiro does not activate any of the distributed configuration.

## 2. Preview, apply, check

Pick a profile: `core`, `aws`, or `connect` (each includes the ones before it). Then, from the `dev-setup` checkout:

```text
node bin/dev-setup.js preview --project /path/to/your-project --profile aws
node bin/dev-setup.js apply   --project /path/to/your-project --profile aws
node bin/dev-setup.js doctor  --project /path/to/your-project
```

Do this on a branch in your project and commit the result for review. See [releasing.md](releasing.md).

`doctor` groups findings as BROKEN CONFIG, OPTIONAL PREREQUISITES MISSING, INFO, and OK. Missing optional tools (for example Git, the AWS CLI, or the CodeGraph binary) never make `doctor` fail.

## 3. Check it in Kiro

These checks need a running Kiro IDE and are not verified by this repository's tests. The same list is in [smoke-test.md](smoke-test.md).

1. Open your project in Kiro IDE 1.x.
2. Steering: the Steering panel lists `cloudnaut-core`. AWS/CDK and Amazon Connect guidance load when your prompt is about them.
3. Skills: ask for `/trace-code-path` or `/review-change`, or describe the task and see whether the skill is offered.
4. MCP (`aws` and `connect`): make sure MCP support is enabled in Kiro settings. Open the MCP servers view and look for `aws-knowledge-mcp`. It needs public internet and no AWS account. Tool calls ask for your approval because nothing is auto-approved.
5. Extension: install AWS Toolkit and check sign-in with your own AWS profile. See [extensions.md](extensions.md).

## 4. Add your project's own guidance

Copy `docs/cloudnaut/project-steering.example.md` to `.kiro/steering/project.md`, replace the fictional content with your architecture, entry points, and verification commands, and add `inclusion: always` front matter if every task should see it. Edit your copy freely. The installed example is owned by the setup, and the copy is yours.

## 5. Optional

- Hook that runs your verification command after each spec task: [hook.md](hook.md)
- Code graph index for large projects: [codegraph.md](codegraph.md)
- Ponytail steering: [ponytail.md](ponytail.md)
- Connect troubleshooting Power: [power.md](power.md)
- Kiro Memory: [memory.md](memory.md)

## Authentication

AWS authentication stays in your own environment (your AWS profiles, SSO session, or the AWS Toolkit sign-in). Do not put credentials in project files, the verify command, or prompts.
