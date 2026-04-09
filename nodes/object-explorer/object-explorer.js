"use strict";

const engine = require("../../lib/object-explorer-engine");

module.exports = function registerObjectExplorerNode(RED) {
  function ObjectExplorerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.name = config.name;
    node.source = config.source || "msg";
    node.path = config.path || "payload";
    node.mode = config.mode || "direct_keys";
    node.outputMode = config.outputMode || "selected_array";
    node.selectionType = config.selectionType || "key";
    node.searchTerm = config.searchTerm || "";
    node.recursive = config.recursive === true;
    node.exactMatch = config.exactMatch === true;
    node.caseSensitive = config.caseSensitive === true;
    node.includeArrays = config.includeArrays !== false;
    node.includeValues = config.includeValues !== false;

    node.on("input", function onInput(msg, send, done) {
      send = send || function legacySend() {
        node.send.apply(node, arguments);
      };

      try {
        // Step 1: resolve the configured source and path safely.
        const resolved = engine.resolveSourceValue({
          source: node.source,
          path: node.path,
          msg,
          node
        });

        if (!resolved.found) {
          return finishWithError(
            `Path not found. Tried to resolve ${resolved.sourcePath}. Missing segment: ${resolved.missingToken}`,
            msg,
            send,
            done
          );
        }

        // Step 2: collect records for the selected mode.
        const records = engine.getRecordsForMode(resolved.value, resolved.resolvedPath, {
          mode: node.mode,
          searchTerm: node.searchTerm,
          recursive: node.recursive,
          exactMatch: node.exactMatch,
          caseSensitive: node.caseSensitive,
          includeArrays: node.includeArrays
        });

        if (!records.length) {
          return finishWithNoMatch(
            "No matching results were found for the selected source, path, and filters.",
            msg,
            resolved,
            send,
            done
          );
        }

        // Step 3: shape the result for Node-RED users.
        msg.payload = engine.shapeOutput(records, {
          mode: node.mode,
          outputMode: node.outputMode,
          selectionType: node.selectionType,
          includeValues: node.includeValues
        });
        msg.count = records.length;
        msg.sourcePath = resolved.sourcePath;
        msg.searchTerm = node.searchTerm;
        msg.mode = node.mode;
        msg.explorer = createExplorerMeta({
          ok: true,
          count: records.length,
          sourcePath: resolved.sourcePath,
          mode: node.mode,
          searchTerm: node.searchTerm,
          message: "Object exploration completed successfully."
        });
        delete msg.error;

        node.status({
          fill: "green",
          shape: "dot",
          text: `${records.length} result${records.length === 1 ? "" : "s"}`
        });

        send([msg, createDiagnosticMessage(msg, msg.explorer)]);

        if (done) {
          done();
        }
      } catch (error) {
        finishWithError(error.message, msg, send, done);
      }
    });

    function finishWithError(message, originalMsg, send, done) {
      const errorMsg = RED.util.cloneMessage(originalMsg);
      errorMsg.error = message;
      errorMsg.payload = null;
      errorMsg.count = 0;
      errorMsg.sourcePath = `${node.source}.${engine.normalizePath(node.source, node.path)}`.replace(/\.$/, "");
      errorMsg.searchTerm = node.searchTerm;
      errorMsg.mode = node.mode;
      errorMsg.explorer = createExplorerMeta({
        ok: false,
        count: 0,
        sourcePath: errorMsg.sourcePath,
        mode: node.mode,
        searchTerm: node.searchTerm,
        message
      });

      node.status({
        fill: "red",
        shape: "ring",
        text: "error"
      });

      send([null, createDiagnosticMessage(errorMsg, errorMsg.explorer)]);

      if (done) {
        done();
      }
    }

    function finishWithNoMatch(message, originalMsg, resolved, send, done) {
      const noMatchMsg = RED.util.cloneMessage(originalMsg);
      noMatchMsg.error = message;
      noMatchMsg.payload = [];
      noMatchMsg.count = 0;
      noMatchMsg.sourcePath = resolved.sourcePath;
      noMatchMsg.searchTerm = node.searchTerm;
      noMatchMsg.mode = node.mode;
      noMatchMsg.explorer = createExplorerMeta({
        ok: false,
        count: 0,
        sourcePath: resolved.sourcePath,
        mode: node.mode,
        searchTerm: node.searchTerm,
        message
      });

      node.status({
        fill: "yellow",
        shape: "ring",
        text: "no match"
      });

      send([null, createDiagnosticMessage(noMatchMsg, noMatchMsg.explorer)]);

      if (done) {
        done();
      }
    }

    function createExplorerMeta(options) {
      return {
        ok: options.ok,
        count: options.count,
        sourcePath: options.sourcePath,
        mode: options.mode,
        searchTerm: options.searchTerm,
        message: options.message
      };
    }

    function createDiagnosticMessage(sourceMsg, explorerMeta) {
      const diagnosticMsg = RED.util.cloneMessage(sourceMsg);
      diagnosticMsg.payload = explorerMeta;
      diagnosticMsg.topic = "object-explorer/status";
      return diagnosticMsg;
    }
  }

  RED.nodes.registerType("object-explorer", ObjectExplorerNode);
};
