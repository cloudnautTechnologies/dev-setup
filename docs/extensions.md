# Extensions and AWS Toolkit

The `aws` profile recommends one extension: AWS Toolkit, Open VSX identifier `amazonwebservices.aws-toolkit-vscode` (publisher Amazon Web Services, verified on Open VSX, Apache-2.0). Language-specific extensions belong in your project's own recommendations. No profile adds them.

## What the setup writes

It adds the identifier to `recommendations` in `.vscode/extensions.json`. If the file exists, only the inserted line changes. Comments, trailing commas, line endings, and other keys stay as they are. If the identifier is already there, nothing changes and it is recorded as not owned by the setup.

Kiro does not document `.vscode/extensions.json`. Kiro is a VS Code based editor, so the file is expected to work, but whether Kiro reads it or shows a prompt is not verified. Treat the install steps below as the supported path.

To decline the recommendation, move the identifier to `unwantedRecommendations`. The setup keeps that choice on upgrades.

## Install through Kiro

Kiro's default extension marketplace is Open VSX (https://open-vsx.org). Organizations can override it with a policy, so your marketplace may differ.

1. Open the Extensions view in Kiro.
2. Search for `AWS Toolkit` and pick the one from Amazon Web Services. The page for it is https://open-vsx.org/extension/amazonwebservices/aws-toolkit-vscode.
3. Install it and reload if asked.
4. Confirm it is listed as installed with the identifier `amazonwebservices.aws-toolkit-vscode`.

Do not rely on a `kiro --install-extension` command. If your Kiro build has a `kiro` shell command it may behave like VS Code's, but that is not verified.

## Verify sign-in with your own AWS profile

The setup never signs you in and never reads AWS profiles. Use a profile you are permitted to use.

1. Sign in through the AWS Toolkit panel in Kiro with your own method (IAM Identity Center or an AWS profile). Follow the prompts the toolkit shows. Kiro-specific steps were not verified.
2. Confirm which identity you got, in a terminal, with your profile name:

   ```text
   aws sts get-caller-identity --profile <your-profile>
   ```

   The output shows an account, a role or user ARN, and a user ID. For example, a fictional result is account `123456789012` and role `arn:aws:sts::123456789012:assumed-role/ExampleReadOnly/example-session`. Check that it is the account and role you expect.
3. In the AWS Toolkit panel, check that the same account and Region appear.

If this fails, fix it in your own environment (SSO session, profile name, Region). Never paste credentials into project files, prompts, or the verify command.
