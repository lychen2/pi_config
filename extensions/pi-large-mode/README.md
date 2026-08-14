# pi-large-mode

An always-loaded `/large` controller that switches the current Pi session between the normal profile and a clean, complete `pi-maestro-flow` profile.

- `/large` or `/large on` activates a validated Flow cache. On first use, the controller resolves the registry version to an exact semver and reproduces the complete result of `pi install npm:pi-maestro-flow@<version>` in an isolated staging profile before committing it.
- Large mode keeps exactly two top-level packages: the complete upstream `pi-maestro-flow` installation and the `pi-large-beautify` bundle. The beautify bundle ships the tool rails, message/input framing, brand header, Matugen footer, and Matugen theme, and it re-exports the official teammate/Cockpit extension surface so those companions do not need their own top-level package entries. Default packages and auto-discovered extensions, skills, prompts, and themes are excluded; the Matugen theme is selected for the Large profile.
- The complete Pi npm root and `MAESTRO_HOME` are switched as directories. `/large off` restores the pre-Large npm, Maestro, settings, project settings, keybindings, and companion state; model/provider changes made during Large are retained.
- `/large status` reports the persisted mode, exact Flow version, cache availability, and pending reload state.
- `/large update` checks the registry. `/large update apply` is available only while Large is off; it builds and validates the new complete profile before replacing the inactive cache.
- Failed reloads remain marked as pending and are retried by the next matching `/large on` or `/large off` command.

The default profile remains the locally maintained `pi_config` stack. Large mode uses the full upstream Flow surface and does not modify third-party package source code.
