# Troubleshooting

## Login Expired or Check Login Error

Symptoms:

- `[登录失效]: check login error。请重新获取refresh_token并更新配置`
- `[登录失效]`
- `refresh_token`
- `check login error`
- token health check marks a token as not live

Root cause: the stored Jimeng/Dreamina session token is expired or invalid. Retrying generation with the same token will fail.

Recovery workflow:

```bash
jimeng token pool --json
jimeng token check --json
```

If the stale token is visible, remove or disable it:

```bash
jimeng token disable --token <expired_token>
# or
jimeng token remove --token <expired_token>
```

Ask the user to refresh login when interactive browser login is required:

```bash
jimeng login --region cn
```

For manual session insertion after the user obtains a new `sessionid`:

```bash
jimeng login --sessionid <new_sessionid> --region cn
```

Use the matching region for international accounts:

```bash
jimeng login --region us
jimeng login --sessionid <new_sessionid> --region jp
```

After login, verify:

```bash
jimeng token pool --json
jimeng token check --region cn --json
jimeng token points --region cn --json
```

Do not print full tokens in the final response. Summarize that the token must be refreshed or has been refreshed.

## No Token Available

Symptoms:

- `No direct token available`
- `No token available for direct task mode`
- token pool is empty
- all tokens are disabled or `live: false`

Run:

```bash
jimeng token pool --json
```

If no enabled live token exists for the requested region, ask the user to log in for that region or add a token:

```bash
jimeng login --region cn
jimeng token add --token <token> --region cn
```

If `TOKEN_POOL_FILE` is set, inspect that file path instead of the default `~/.jimeng/token-pool.json`.

## Region or Model Mismatch

Symptoms:

- model is not listed for the selected region
- generation fails immediately after token selection
- manual model warnings

Check available models:

```bash
jimeng models list --region <region> --verbose --json
jimeng models list --all-known --region <region> --verbose --json
```

Then retry with a model known for that region. Defaults that usually work:

- Images: `jimeng-4.5`
- CN video: `jimeng-video-3.0` or `jimeng-video-3.5-pro`
- Omni-reference: `jimeng-video-seedance-2.0-fast`
- HK/JP/SG VEO: `jimeng-video-veo3`, `jimeng-video-veo3.1`

Manual or VIP models can still fail even when listed locally because entitlement is account-specific.

## Insufficient Points

Symptom: `[积分不足]`.

Check points:

```bash
jimeng token points --region <region> --json
```

Try lower-cost options only if acceptable to the user: shorter video duration, lower image resolution, or a different model. Otherwise tell the user the account needs points/credits.

## Content Filter

Symptom: `[内容违规]`.

Do not keep retrying the same prompt. Ask the user to revise the prompt or make a safer alternative that preserves benign intent.

## Timeout or Long Generation

If a wait command times out but returns a task ID, continue with task polling:

```bash
jimeng task wait --task-id <id> --type image --wait-timeout-seconds 300 --json
jimeng task wait --task-id <id> --type video --wait-timeout-seconds 600 --json
```

For long videos, prefer:

```bash
jimeng video generate --prompt "..." --no-wait --json
```

Then poll with `jimeng task wait`.

## Local File Errors

For image edit and video reference inputs, resolve local files before running:

```bash
ls -la ./input.png
```

For `jimeng image edit`, use all local files or all URLs. Mixed local and URL inputs are rejected.
