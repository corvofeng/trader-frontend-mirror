---
name: deploy-cloudflare
description: >-
  Use this skill when the user wants to commit changes, deploy the frontend to Cloudflare,
  and wait for the Cloudflare deployment to complete and verify that the page is live.
---

# Deploy to Cloudflare (trader-frontend)

This skill guides the end-to-end workflow for committing frontend changes, deploying to Cloudflare (via local Wrangler deploy or GitHub Actions Tag trigger), waiting for edge propagation, and verifying live availability on `https://stock.corvo.fun/`.

---

## 1. Pre-Flight Checklist

Before deploying, verify the working tree and build integrity:

1. **Check Git Status & Diff**:
   ```bash
   git status
   git diff
   ```
   Confirm all changed files are intended.

2. **Verify Static Build for Cloudflare**:
   ```bash
   npm run build:cf
   ```
   Ensure the build passes without syntax errors and `dist/index.html` is generated properly.

---

## 2. Commit and Push Changes

1. **Stage Modified Files**:
   ```bash
   git add <modified-files>
   ```
   *Tip: Avoid `git add .` if there are untracked scratch files.*

2. **Format Conventional Commit Message**:
   Follow conventional commits:
   - `fix(cloudflare): ...`
   - `feat(meta): ...`
   - `refactor(...): ...`
   
   Example:
   ```bash
   git commit -m "fix(cloudflare): update site domain to stock.corvo.fun and add open graph meta tags"
   ```

3. **Push to Remote Main Branch**:
   ```bash
   git push origin main
   ```

---

## 3. Deployment Execution (Choose One Strategy)

### Strategy A: Direct Local Wrangler Deploy (Recommended for Fast Feedback)
The project provides a dedicated script with Cloudflare DNS override configured:

1. **Run Deployment Command**:
   ```bash
   npm run deploy:cf
   ```
   *Note: This runs `npm run build:cf && NODE_OPTIONS="-r ./scripts/dns-override.cjs" wrangler deploy`.*

2. **Wait and Monitor Output**:
   Wait for Wrangler output to display:
   ```text
   ✨ Success! Uploaded X files ...
   Deployed trader-frontend triggers
     stock.corvo.fun/* (zone name: corvo.fun)
   Current Version ID: <version-id>
   ```
   Capture the **Current Version ID**.

---

### Strategy B: Tag Release via GitHub Actions (Recommended for Formal Releases)
The repository has [.github/workflows/deploy-cloudflare.yml](file:///home/corvo/GitRepo/trader-frontend/.github/workflows/deploy-cloudflare.yml) configured to trigger on `v*` tags.

1. **Check Latest Git Tags**:
   ```bash
   git tag --sort=-v:refname | head -n 5
   ```

2. **Create and Push Increment Tag**:
   ```bash
   # Example: bump v0.3.0 -> v0.3.1
   git tag v0.3.1
   git push origin v0.3.1
   ```

3. **Monitor GitHub Actions Run**:
   ```bash
   # Watch the triggered workflow run until completion
   gh run watch $(gh run list --workflow=deploy-cloudflare.yml --limit 1 --json databaseId -q '.[0].databaseId')
   ```

---

## 4. Post-Deployment Verification

Once deployment finishes, verify that the edge CDN serves the updated assets:

1. **Check HTTP Status & Headers**:
   ```bash
   curl -sI https://stock.corvo.fun/ | head -n 10
   ```
   Confirm `HTTP/2 200` or `HTTP/1.1 200`.

2. **Verify Updated Content (e.g. Meta Tags / Route)**:
   ```bash
   curl -sL https://stock.corvo.fun/ | grep -E "og:title|og:url|canonical"
   ```
   Ensure the output matches the newly deployed domain and meta definitions.

---

## 5. Report to User

Summarize the deployment in a clear response:
- **Git Commit**: Commit hash and message.
- **Deployment Mode**: Direct Wrangler deploy or GitHub Action tag release.
- **Cloudflare Version ID**: The version string returned by Wrangler.
- **Edge Domain**: [https://stock.corvo.fun/](https://stock.corvo.fun/)
- **Live Status**: HTTP status code and verified feature confirmation.
