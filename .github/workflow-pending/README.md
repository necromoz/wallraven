# Waiting to be installed

`desktop.yml` belongs at `.github/workflows/desktop.yml`. It is parked here
because GitHub refuses to accept a workflow file from a fine-grained personal
access token that does not carry the **Workflows** permission, and the token
available when this was written did not have it.

To install it, with a token that has Workflows: Read and write:

    git mv .github/workflow-pending/desktop.yml .github/workflows/desktop.yml
    git rm .github/workflow-pending/README.md
    git commit -m "Install the desktop build workflow"
    git push

Pushing it to a `fixes/*` branch or to `main` triggers the first build. Nothing
runs while it sits in this directory: GitHub only reads workflows from
`.github/workflows/`.
