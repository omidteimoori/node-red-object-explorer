"use strict";

const assert = require("node:assert/strict");
const engine = require("../lib/object-explorer-engine");

const verificationSteps = [
  {
    name: "tokenizePath supports dot and bracket notation",
    run: function runStep() {
      assert.deepEqual(
        engine.tokenizePath("payload.fields[0].name"),
        ["payload", "fields", 0, "name"]
      );
    }
  },
  {
    name: "resolveSourceValue resolves msg paths",
    run: function runStep() {
      const resolved = engine.resolveSourceValue({
        source: "msg",
        path: "payload.items[1].name",
        msg: {
          payload: {
            items: [{ name: "a" }, { name: "b" }]
          }
        }
      });

      assert.equal(resolved.found, true);
      assert.equal(resolved.value, "b");
      assert.equal(resolved.resolvedPath, "msg.payload.items[1].name");
    }
  },
  {
    name: "collectRecords walks nested objects and arrays",
    run: function runStep() {
      const records = engine.collectRecords(
        {
          fields: {
            sensors: [{ id: "a" }, { id: "b" }]
          }
        },
        "msg.payload",
        { includeArrays: true, recursive: true }
      );

      const paths = records.map(function mapPath(record) {
        return record.path;
      });

      assert.ok(paths.includes("msg.payload.fields"));
      assert.ok(paths.includes("msg.payload.fields.sensors[0].id"));
      assert.ok(paths.includes("msg.payload.fields.sensors[1].id"));
    }
  },
  {
    name: "matching is case insensitive by default",
    run: function runStep() {
      const records = [
        { key: "UpdatedAt", path: "msg.payload.UpdatedAt" },
        { key: "topic", path: "msg.payload.topic" }
      ];

      const filtered = engine.filterRecords(records, {
        searchTerm: "updatedAt",
        exactMatch: false,
        caseSensitive: false
      });

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].key, "UpdatedAt");
    }
  },
  {
    name: "shapeOutput supports dropdown options",
    run: function runStep() {
      const payload = engine.shapeOutput(
        [
          {
            key: "temperature",
            path: "global.variables.devices[0].topics.temperature",
            value: "building/a/temp"
          }
        ],
        {
          outputMode: "dropdown_options",
          selectionType: "path",
          includeValues: true
        }
      );

      assert.deepEqual(payload, [
        {
          label: "global.variables.devices[0].topics.temperature",
          value: "global.variables.devices[0].topics.temperature"
        }
      ]);
    }
  },
  {
    name: "mode changes the returned content between keys values and pairs",
    run: function runStep() {
      const records = [
        {
          key: "temperature",
          path: "msg.payload.fields.temperature",
          value: 21.4
        }
      ];

      const keyPayload = engine.shapeOutput(records, {
        mode: "direct_keys",
        outputMode: "selected_array",
        selectionType: "path_value",
        includeValues: true
      });

      const valuePayload = engine.shapeOutput(records, {
        mode: "direct_values",
        outputMode: "selected_array",
        selectionType: "key",
        includeValues: true
      });

      const pairPayload = engine.shapeOutput(records, {
        mode: "key_value_pairs",
        outputMode: "array_path_key_value",
        selectionType: "path_value",
        includeValues: true
      });

      assert.deepEqual(keyPayload, ["temperature"]);
      assert.deepEqual(valuePayload, [21.4]);
      assert.deepEqual(pairPayload, [
        {
          path: "msg.payload.fields.temperature",
          key: "temperature",
          value: 21.4
        }
      ]);
    }
  },
  {
    name: "key modes can still return full paths when requested",
    run: function runStep() {
      const records = [
        {
          key: "temperature",
          path: "msg.payload.fields.temperature",
          value: 21.4
        }
      ];

      const payload = engine.shapeOutput(records, {
        mode: "deep_keys",
        outputMode: "selected_array",
        selectionType: "path",
        includeValues: true
      });

      assert.deepEqual(payload, ["msg.payload.fields.temperature"]);
    }
  }
];

let completedCount = 0;

verificationSteps.forEach(function runVerificationStep(step, index) {
  step.run();
  completedCount += 1;
  process.stdout.write(`ok ${index + 1} - ${step.name}\n`);
});

process.stdout.write(`verification passed: ${completedCount} checks\n`);
