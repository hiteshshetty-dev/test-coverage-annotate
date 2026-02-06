# Test Coverage Annotate - GitHub Action

A GitHub Action that enhances your code review process by providing visual insights into test coverage directly on your pull requests.

<p align="center">
  <img width="739" alt="test-coverage-annotate" src="https://github.com/ZainAmjad68/test-coverage-annotate/assets/53145353/dd63374d-9251-4010-817d-c0eb17f4875d">
</p>

## :mag: Overview

Test Coverage Annotate is a powerful GitHub Action that scans the changes in a pull request and utilizes the provided coverage report to display annotations on the PR, highlighting uncovered parts of the code. This allows developers and reviewers to quickly identify areas with insufficient test coverage and take appropriate actions.

## :bulb: Features

- Seamlessly integrates into your pull request workflow.
- Provides actionable insights into code coverage.
- Customizable annotation style: choose between summarized or detailed annotations.
- Flexible annotation types: focus on lines, functions, or branches that need attention.
- Easy-to-use configuration with sensible defaults.
- **PR comment** with unit coverage details: a single comment on the PR is created or updated with pass/fail status, new-lines coverage %, and file-level warning counts (green ✅ for passed, red ❌ for failed).
- Ability to integrate with Travis Jobs

## :gear: Configuration

### Inputs

### `token` (required)

The access token required to interact with the GitHub API for fetching pull request details.

### `coverage-info-path` (optional)

The path to the coverage report file. This defaults to './coverage/lcov.info'.

### `annotation-coverage` (optional)

Specifies the style of coverage annotations to display:
- `summarize`: Show a summary annotation on each file.
- `detailed`: Display line-level annotations directly in the code.

Defaults to 'summarize'.

### `annotation-type` (optional)

The type of coverage aspects to annotate:
- `lines`: Annotate uncovered lines.
- `functions`: Annotate uncovered functions.
- `branches`: Annotate uncovered branches.
- `all`: Annotate all of the above aspects.

Defaults to 'all'.

### `new-lines-coverage-threshold` (optional)

Minimum percentage of new/changed lines in the PR that must be covered by tests (0–100). If coverage of new lines falls below this value, the check fails and the action step fails. Use this to enforce that new code is tested.

Defaults to `90`.

### `comment-on-pr` (optional)

Whether to post (or update) a coverage summary comment on the PR. Set to `false` to disable. Defaults to `true`.

If you get **403** when posting the comment (e.g. `POST .../issues/.../comments - 403`), the token likely cannot write to the PR. This often happens for **pull requests from forks**, where the default `GITHUB_TOKEN` has limited permissions. Options:

- **Use a Personal Access Token (PAT):** Create a PAT with `repo` (or for public repos `public_repo`) and pass it as the `token` input instead of `GITHUB_TOKEN`.
- **Grant permissions in the workflow:** Ensure the job has `contents: read`, `pull-requests: write` (and `issues: write` if needed). For fork PRs, writing comments may still be restricted by GitHub.
- **Disable the comment:** Set `comment-on-pr: false` so the action skips posting the comment; annotations and the check run will still work.

## :rocket: Example Usage

To integrate test coverage annotations into your GitHub Actions workflow, you can use the `test-coverage-annotate` action like this:

```yaml
uses: your-username/test-coverage-annotate@v0.8
with:
  token: ${{ secrets.GITHUB_TOKEN }}
  coverage-info-path: './coverage/lcov.info'
  annotation-coverage: 'detailed'
  annotation-type: 'all'
```

If you get **403** when posting the coverage comment (e.g. on fork PRs), disable the comment or use a PAT:

```yaml
with:
  token: ${{ secrets.GITHUB_TOKEN }}
  comment-on-pr: false   # skip PR comment; annotations and check still run
```

This can also be used with Travis Jobs as that is how i'm using it within my organization, please get in touch if you want to go through the steps.

**Note:** If you are using [actions/checkout](https://github.com/actions/checkout) in your workflow, make sure you add the `fetch-depth: 0` parameter. This is necessary for the tool to access the coverage file properly.

## Releasing

To publish a new version, use **semver tags** (e.g. `v1.0.0`). Ensure `dist/` is committed, then create and push a tag:

```bash
npm run build && git add dist && git commit -m "chore: build" && git push
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

The [release workflow](.github/workflows/release.yml) runs on tag push `v*`, runs build/test, and creates a GitHub Release. See [docs/RELEASING.md](docs/RELEASING.md) for full release and versioning details.
