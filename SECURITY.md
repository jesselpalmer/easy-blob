# Security reporting

Report vulnerabilities privately using GitHub's **Security → Report a vulnerability** entry for
[this repository](https://github.com/jesselpalmer/easy-blob/security). If that private reporting option
is unavailable, request a private contact channel from the maintainer without posting exploit details
or sensitive data in a public issue. Do not upload production databases, secrets or user files.

Include the affected version, supported Node/platform, minimal reproduction, expected/observed impact
and any safe mitigation. There is no guaranteed response-time SLA. The release candidate is under
review; a dependency audit result is a dated signal, not a claim that the package has no vulnerabilities.

The intended boundary is a single local storage owner behind application-controlled authentication,
authorization and network controls. MIME filtering uses untrusted declarations and is not content or
malware validation. File permissions and protection against other local processes belong to the host.
See [operations](docs/OPERATIONS.md) for the supported storage model and recovery limitations.
