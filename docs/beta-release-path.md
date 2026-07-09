# Beta Release Path

Advanced Code Editor beta releases are created by `.github/workflows/beta-release.yml`.

The beta path is a typed implementation branch pushed to GitHub. It is not `master`, and it does not require local artifact edits. Pushing any of these branch shapes triggers the beta workflow:

- `feature/**` or `feature-*`
- `feat/**` or `feat-*`
- `fix/**` or `fix-*`
- `bug/**`, `bug-*`, `bugfix/**`, or `bugfix-*`
- `hotfix/**` or `hotfix-*`
- `chore/**` or `chore-*`
- `deps/**` or `deps-*`
- `docs/**` or `docs-*`
- `refactor/**` or `refactor-*`
- `perf/**` or `perf-*`
- `test/**`, `test-*`, `tests/**`, or `tests-*`
- `ci/**` or `ci-*`
- `build/**` or `build-*`
- `style/**` or `style-*`

The workflow computes the next beta SemVer tag with `scripts/compute-beta-version.ts`, writes that version into `package.json`, `manifest.json`, `manifest-beta.json`, and `versions.json` inside the workflow workspace, builds `dist/`, and publishes a GitHub prerelease named `Beta <version>`.

The prerelease target commit is the pushed branch ref, via `target_commitish: ${{ github.ref_name }}`. The workflow does not commit generated version changes back to the branch.

## BRAT Assets

Every beta prerelease must attach these BRAT-installable assets:

- `main.js`
- `manifest.json`
- `styles.css`
- `advanced-code-block-<beta-version>.zip`

The zip contains the same built plugin payload under an `advanced-code-block/` plugin folder.

## Verification

For a verified implementation batch, confirm the release from GitHub after CI creates it:

```bash
rtk gh release list --limit 5
rtk gh release view <beta-version> --json tagName,isPrerelease,assets,url
```

The release is valid for BRAT when:

- `isPrerelease` is `true`
- `tagName` is the computed beta version, for example `0.9.1-beta.27`
- assets include `main.js`, `manifest.json`, `styles.css`, and `advanced-code-block-<beta-version>.zip`
- `manifest.json` inside the release reports the same beta version BRAT should display

Do not hand-edit release assets locally. If the beta is wrong, fix the workflow or source files and push a new typed branch commit.
