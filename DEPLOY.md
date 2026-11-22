# Deploy: Zero Trust Issues (zerotrustissues.pages.dev)

Existing Cloudflare account (shared with statefile.io for now), personal GitHub (daviinaa), GitHub Actions deploys `public/`.
Nothing here has been run for you.

## 1. Cloudflare account
For now the blog lives in the existing account (the one that also runs statefile.io).
It is static, so moving it to its own account later is a new Pages project plus two updated secrets.
Do not buy zerotrustissues.dev here unless the blog is staying in this account.
The Account ID is the long hex string in the dashboard URL (dash.cloudflare.com/<ACCOUNT_ID>/home), or from `wrangler whoami`.

## 2. Create the Pages project
```
npx wrangler@4 login
npx wrangler@4 whoami                # confirm the account id matches the dashboard URL
npx wrangler@4 pages project create zerotrustissues --production-branch main
```
If the name is taken, Cloudflare gives a different *.pages.dev address: tell Claude before pushing.

## 3. API token for GitHub Actions
Dashboard: My Profile, API Tokens, Create Token, Create Custom Token.
- Permissions: Account, Cloudflare Pages, Edit
- Account Resources: Include, this account
Make a NEW token just for the blog; do not reuse the statefile.io deploy token. Name it e.g. `zerotrustissues-deploy`.
Copy the token (shown once).

## 4. Repo, environments, secrets, first deploy
Public repo: GitHub environments with secrets need a paid plan on private repos.
```
cp -R /Users/davinaanthony/wrkshop/_staging/davina-site /Users/davinaanthony/wrkshop/zerotrustissues
cd /Users/davinaanthony/wrkshop/zerotrustissues
git init -b main
git config user.email                # should be your GitHub noreply address; if not, fix before committing
gh auth switch -h github.com -u daviinaa
gh repo create daviinaa/zerotrustissues --public --source . --remote origin
gh api -X PUT repos/daviinaa/zerotrustissues/environments/production
gh api -X PUT repos/daviinaa/zerotrustissues/environments/preview
for e in production preview; do
  gh secret set CLOUDFLARE_API_TOKEN  --env $e -R daviinaa/zerotrustissues   # paste the token
  gh secret set CLOUDFLARE_ACCOUNT_ID --env $e -R daviinaa/zerotrustissues   # paste the account id
done
git add -A
git commit -m "Initial site"
git push -u origin main
gh run watch -R daviinaa/zerotrustissues
```

## 5. Verify
```
curl -sI https://zerotrustissues.pages.dev | grep -iE '^HTTP|content-security-policy|strict-transport|x-robots'
```
Expect HTTP 200, CSP and HSTS present, and no X-Robots-Tag on the production address.

## Later
- New posts: branch, add the post, open a PR (preview URL in the Actions log), merge.
- Custom domain (zerotrustissues.dev looked unregistered on 2026-11-22): buy it on the personal
  Cloudflare account, add it under the Pages project's Custom domains, then add the production
  pages.dev address back to `_headers` with `X-Robots-Tag: noindex`.
