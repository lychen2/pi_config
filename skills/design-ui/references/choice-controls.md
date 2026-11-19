# Choosing a control

Before choosing a component, identify the value or action, when it takes effect, how many options a person can pick, and what the trigger shows afterwards. Use the product's existing controls and preserve saved values. [Vibe Design Tips 020](https://vibedesign.tips/zh/020-choice-controls/)

| Decision | Control | Observable behaviour |
| --- | --- | --- |
| One setting turns on or off immediately | Switch | The setting and its effect update on toggle. The label names the setting in either state. |
| A yes/no answer belongs to a form | Checkbox | The check records a draft answer. Save or Submit applies it with the other fields. |
| Several independent options, including none | Checkboxes | Each can be toggled independently. Filters may apply immediately when that is the established interaction. |
| Exactly one of 2–5 stable, short options | Segmented control | All choices stay visible. Fits a value or views of the same data, such as List and Board. |
| Exactly one option, with explanations or a need to read every choice | Radio group | Give each option room for its description. Include an explicit None when that is a valid answer. |
| One value from 6+ options, long names, or a set that can grow | Select | The closed field displays the saved value. For a large directory use a searchable combobox with a clear empty result. For multiple values show checkboxes and a summary of the selection. |
| Navigate between distinct content panels | Tabs | Each tab identifies and opens its associated panel. Expose the active tab and panel to assistive technology. |
| Run a command such as Export, Duplicate or Delete | Menu button | Choosing an item runs it and the trigger retains its name. Use a split button when a frequent primary action has related variants. |

A boolean setting such as “Show archived” has one control. Two separately named values such as Monthly and Yearly form a single-choice group. Check the labels at the actual width and in the supported locales before using option count alone to decide the layout.

Prefer native semantics. A switch exposes its checked state, radio groups and tabs support arrow-key navigation, and a menu returns focus to its trigger on Escape. Give touch targets about 44 × 44 CSS px. Identify disabled controls and the reason they are unavailable. Use an explicit opt-in for subscriptions or consent.

For a product-wide audit, list each setting's current control, cardinality, commit point and recommended control. Call out any change to when data is saved before applying the selected changes. Exercise keyboard input and verify that the value visible after reopening matches what the user saved.
