# Native SDK acceptance — 2026-10-01

Target: official Windows DeepSeek Harness Desktop 0.2.0-rc.2, using its own
Electron executable in Node mode (Node 24.18.1). Git for Windows Bash 5.2.37
was found at `F:\Git\bin\bash.exe`. No model request was used in these tests.

The pre-gate probe used the official Windows sandbox/subprocess services.
The read-only restricted token produced exit 3221225794 and MSYS's
`couldn't create signal pipe, Win32 error 5`. The first workspace-write probe
also hit a `grantWrite` Win32 5 error on its own fixture folder; no ACL repair
was attempted, since read-only already established the MSYS startup issue.

The adapter now refuses confined Git Bash executions before spawning or
changing a permission mode. Under an explicitly supplied full-access policy,
the real SDK passed:

- UTF-8 Chinese output and a working directory with Chinese and spaces;
- Git execution and native Windows Node execution;
- fixture file writing and nonzero exit-code propagation;
- live background handle, completion and incremental-output consumption;
- timeout classification and provider-managed process termination;
- refusal of a confined write, with the outside fixture unchanged.

The package was installed and enabled through official Desktop's Plugins
page. Its separate `标准模式 (Git Bash)` item appeared as usable in the new
session preset selector. Selecting it retained `工作区内修改`; it did not
silently select full access. The official standard preset and existing
`minimal-gitbash` files were preserved.
The blank UI verification session was returned to the official standard mode.
The active `cordis.patch.yml` SHA256 still matched its pre-install backup.
