# @omidteimoori/node-red-object-explorer

A custom Node-RED node for exploring JavaScript objects from `msg`, `flow`, and `global` context.

It helps users inspect nested data, discover available variables, return keys, values, or both, and prepare results for later logic or dropdown-style UI usage.

## Links

- GitHub: [https://github.com/omidteimoori/node-red-object-explorer](https://github.com/omidteimoori/node-red-object-explorer)
- npm: [https://www.npmjs.com/package/@omidteimoori/node-red-object-explorer](https://www.npmjs.com/package/@omidteimoori/node-red-object-explorer)
- Package name: `@omidteimoori/node-red-object-explorer`

## Features

- Explore objects from:
  - `msg`
  - `flow`
  - `global`
- Resolve nested paths such as:
  - `payload`
  - `payload.fields`
  - `variables.devices[0].topics`
  - `items[0].name`
- Return:
  - direct keys
  - deep keys
  - direct values
  - deep values
  - key/value pairs
  - matching keys
  - matching values
  - matching key/value pairs
- Search by partial or exact key/path match
- Support arrays and nested objects
- Safe handling for missing paths, `null`, `undefined`, and circular references
- Optional second output for diagnostics

## Installation

Install the package in the Node-RED user directory:

```bash
cd ~/.node-red
npm install @omidteimoori/node-red-object-explorer
```

Then restart Node-RED and refresh the editor.

## Supported Versions

- Node-RED: `>=3.0.0`
- Node.js: `>=16.0.0`

## Usage

1. Open the Node-RED editor
2. Drag the **object explorer** node into a flow
3. Choose the source:
   - `msg`
   - `flow`
   - `global`
4. Enter the path to explore
5. Choose the mode
6. Choose the output format
7. Optionally enter a search term

## Example Flow

The package includes a small example flow in the `examples` folder. In Node-RED, open the import menu and look under the **Examples** section for **Basic Object Exploration**.

## Modes

- `direct_keys`
  Returns the immediate child keys of the selected object
- `deep_keys`
  Returns all nested keys below the selected object
- `direct_values`
  Returns the immediate child values
- `deep_values`
  Returns all nested values
- `key_value_pairs`
  Returns keys and values together
- `matching_keys`
  Returns keys or paths that match the search term
- `matching_values`
  Returns values under matching keys
- `matching_key_value_pairs`
  Returns matching paths, keys, and values together

## Output

The node writes the main result to `msg.payload`.

It also sets:

- `msg.count`
- `msg.sourcePath`
- `msg.searchTerm`
- `msg.mode`

### Output 1

Main result data.

### Output 2

Diagnostic status data for:

- success
- no-match
- error cases

This can be useful for debug panels, status handling, or logging.

## Example Use Cases

### Get direct keys from `msg.payload`

- Source: `msg`
- Path: `payload`
- Mode: `direct_keys`

Example result:

```json
[
  "device1",
  "device2"
]
```

### Get nested values under `msg.payload`

- Source: `msg`
- Path: `payload`
- Mode: `deep_values`

### Get all `packet` objects below `msg.payload`

- Source: `msg`
- Path: `payload`
- Mode: `matching_values`
- Search: `packet`
- Recursive: `true`
- Exact match: `true`

Example result:

```json
[
  {
    "packet1": 1,
    "packet2": 2
  },
  {
    "packetX1": "Y1",
    "packetX2": "Y2"
  }
]
```

### Build dropdown options from nested keys

- Source: `msg`
- Path: `payload.fields`
- Mode: `deep_keys`
- Output: `dropdown_options`
- Selected item: `path`

Example result:

```json
[
  {
    "label": "msg.payload.fields.temperature.value",
    "value": "msg.payload.fields.temperature.value"
  },
  {
    "label": "msg.payload.fields.temperature.updatedAt",
    "value": "msg.payload.fields.temperature.updatedAt"
  }
]
```

## Notes

- The node is designed to help users explore unknown or deeply nested structures without writing repeated Function node code.
- If a path does not exist, the node does not crash. It sends a diagnostic message to the second output.
- Arrays are supported when `Include arrays` is enabled.

## Related

- [Node-RED](https://nodered.org/)
- [GitHub Repository](https://github.com/omidteimoori/node-red-object-explorer)
- [npm Package](https://www.npmjs.com/package/@omidteimoori/node-red-object-explorer)

## Author

Developed by [Omid Teimoori](https://omidteimoori.com)

MIT License
