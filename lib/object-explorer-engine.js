"use strict";

// The helper module keeps parsing, traversal, filtering, and output shaping
// in one place so the runtime node stays small and easy to reason about.

function isObjectLike(value) {
  return value !== null && typeof value === "object";
}

function isTraversable(value, includeArrays) {
  if (!isObjectLike(value)) {
    return false;
  }

  if (Array.isArray(value)) {
    return includeArrays;
  }

  return true;
}

function normalizePath(source, rawPath) {
  const value = String(rawPath || "").trim();

  if (!value) {
    return "";
  }

  if (source === "msg" && value.startsWith("msg.")) {
    return value.slice(4);
  }

  if (source === "flow" && value.startsWith("flow.")) {
    return value.slice(5);
  }

  if (source === "global" && value.startsWith("global.")) {
    return value.slice(7);
  }

  return value;
}

function tokenizePath(path) {
  const source = String(path || "").trim();
  const tokens = [];
  let index = 0;

  // Supports both dot notation and bracket notation:
  // payload.fields[0].name
  // variables.devices[0].topics
  while (index < source.length) {
    const character = source[index];

    if (character === ".") {
      index += 1;
      continue;
    }

    if (character === "[") {
      const endBracket = source.indexOf("]", index);

      if (endBracket === -1) {
        throw new Error("Invalid path: missing closing ]");
      }

      let token = source.slice(index + 1, endBracket).trim();

      if (!token) {
        throw new Error("Invalid path: empty [] segment");
      }

      if (
        (token.startsWith("\"") && token.endsWith("\"")) ||
        (token.startsWith("'") && token.endsWith("'"))
      ) {
        token = token.slice(1, -1);
      } else if (/^\d+$/.test(token)) {
        token = Number(token);
      }

      tokens.push(token);
      index = endBracket + 1;
      continue;
    }

    let endIndex = index;
    while (
      endIndex < source.length &&
      source[endIndex] !== "." &&
      source[endIndex] !== "["
    ) {
      endIndex += 1;
    }

    const token = source.slice(index, endIndex).trim();
    if (token) {
      tokens.push(token);
    }

    index = endIndex;
  }

  return tokens;
}

function formatTokenForPath(token) {
  if (typeof token === "number") {
    return `[${token}]`;
  }

  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token)) {
    return token;
  }

  return `[${JSON.stringify(String(token))}]`;
}

function appendPath(basePath, token) {
  const segment = formatTokenForPath(token);

  if (!basePath) {
    return typeof token === "number" ? segment : segment;
  }

  if (typeof token === "number") {
    return `${basePath}${segment}`;
  }

  if (segment.startsWith("[")) {
    return `${basePath}${segment}`;
  }

  return `${basePath}.${segment}`;
}

function getLastTokenFromPath(path) {
  const tokens = tokenizePath(path);

  if (!tokens.length) {
    return "";
  }

  return String(tokens[tokens.length - 1]);
}

function resolveTokensFromValue(rootValue, tokens, basePath) {
  let value = rootValue;
  let resolvedPath = basePath || "";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (value === null || value === undefined) {
      return {
        found: false,
        value: undefined,
        resolvedPath,
        missingToken: String(token)
      };
    }

    if (typeof token === "number") {
      if (!Array.isArray(value) || token < 0 || token >= value.length) {
        return {
          found: false,
          value: undefined,
          resolvedPath,
          missingToken: String(token)
        };
      }
    } else if (!(token in Object(value))) {
      return {
        found: false,
        value: undefined,
        resolvedPath,
        missingToken: String(token)
      };
    }

    value = value[token];
    resolvedPath = appendPath(resolvedPath, token);
  }

  return {
    found: true,
    value,
    resolvedPath
  };
}

function resolveFromMessage(msg, path) {
  const normalizedPath = normalizePath("msg", path);
  const tokens = tokenizePath(normalizedPath);

  if (!tokens.length) {
    return {
      found: true,
      value: msg,
      resolvedPath: "msg",
      sourcePath: "msg"
    };
  }

  const resolved = resolveTokensFromValue(msg, tokens, "msg");
  return {
    found: resolved.found,
    value: resolved.value,
    resolvedPath: resolved.resolvedPath,
    missingToken: resolved.missingToken,
    sourcePath: `msg.${normalizedPath}`
  };
}

function resolveFromContext(contextStore, source, path) {
  const normalizedPath = normalizePath(source, path);
  const tokens = tokenizePath(normalizedPath);

  if (!tokens.length) {
    return {
      found: false,
      value: undefined,
      resolvedPath: source,
      missingToken: "(root)",
      sourcePath: source
    };
  }

  const rootToken = tokens[0];
  const remainder = tokens.slice(1);
  const rootValue = contextStore.get(String(rootToken));
  const rootPath = appendPath(source, rootToken);

  if (rootValue === undefined) {
    return {
      found: false,
      value: undefined,
      resolvedPath: source,
      missingToken: String(rootToken),
      sourcePath: `${source}.${normalizedPath}`
    };
  }

  const resolved = resolveTokensFromValue(rootValue, remainder, rootPath);
  return {
    found: resolved.found,
    value: resolved.value,
    resolvedPath: resolved.resolvedPath,
    missingToken: resolved.missingToken,
    sourcePath: `${source}.${normalizedPath}`
  };
}

function resolveSourceValue(options) {
  const source = options.source || "msg";

  // msg paths are read directly from the message object.
  // flow/global start with a context key, then continue with normal traversal.
  if (source === "msg") {
    return resolveFromMessage(options.msg, options.path);
  }

  if (source === "flow") {
    return resolveFromContext(options.node.context().flow, "flow", options.path);
  }

  return resolveFromContext(options.node.context().global, "global", options.path);
}

function getChildEntries(value, basePath, depth, includeArrays) {
  if (!isTraversable(value, includeArrays)) {
    return [];
  }

  const entries = [];

  if (Array.isArray(value)) {
    value.forEach(function mapArrayEntry(item, index) {
      entries.push({
        path: appendPath(basePath, index),
        key: String(index),
        value: item,
        depth
      });
    });

    return entries;
  }

  Object.keys(value).forEach(function mapObjectEntry(key) {
    entries.push({
      path: appendPath(basePath, key),
      key,
      value: value[key],
      depth
    });
  });

  return entries;
}

function enrichRecord(record, includeArrays) {
  const enriched = {
    path: record.path,
    key: record.key,
    value: record.value,
    depth: record.depth,
    isArray: Array.isArray(record.value),
    isObject: isObjectLike(record.value) && !Array.isArray(record.value),
    isLeaf: !isTraversable(record.value, includeArrays),
    valueType: getValueType(record.value),
    isCircular: false
  };

  return enriched;
}

function collectRecords(rootValue, basePath, options) {
  const includeArrays = options.includeArrays !== false;
  const recursive = options.recursive === true;
  const results = [];
  const visited = new WeakSet();
  const initialEntries = getChildEntries(rootValue, basePath, 1, includeArrays);
  const stack = initialEntries
    .slice()
    .reverse()
    .map(function mapInitialEntry(entry) {
      return enrichRecord(entry, includeArrays);
    });

  if (isObjectLike(rootValue)) {
    visited.add(rootValue);
  }

  // Iterative depth-first traversal keeps the logic safe for larger objects
  // and lets us track circular references with a WeakSet.
  while (stack.length > 0) {
    const record = stack.pop();
    results.push(record);

    if (!recursive || !isTraversable(record.value, includeArrays)) {
      continue;
    }

    if (isObjectLike(record.value)) {
      if (visited.has(record.value)) {
        record.isCircular = true;
        continue;
      }

      visited.add(record.value);
    }

    const childEntries = getChildEntries(
      record.value,
      record.path,
      record.depth + 1,
      includeArrays
    );

    childEntries
      .slice()
      .reverse()
      .forEach(function queueChildEntry(entry) {
        stack.push(enrichRecord(entry, includeArrays));
      });
  }

  return results;
}

function createScalarRecord(value, path) {
  return {
    path,
    key: getLastTokenFromPath(path),
    value,
    depth: 0,
    isArray: Array.isArray(value),
    isObject: isObjectLike(value) && !Array.isArray(value),
    isLeaf: true,
    valueType: getValueType(value),
    isCircular: false
  };
}

function normalizeForMatch(value, caseSensitive) {
  const text = String(value);
  return caseSensitive ? text : text.toLowerCase();
}

function matchesSearch(record, searchTerm, exactMatch, caseSensitive) {
  if (!searchTerm) {
    return true;
  }

  const normalizedNeedle = normalizeForMatch(searchTerm, caseSensitive);
  const haystacks = [record.key, record.path];

  return haystacks.some(function compareText(candidate) {
    const normalizedCandidate = normalizeForMatch(candidate, caseSensitive);

    if (exactMatch) {
      return normalizedCandidate === normalizedNeedle;
    }

    return normalizedCandidate.includes(normalizedNeedle);
  });
}

function filterRecords(records, options) {
  return records.filter(function filterRecord(record) {
    return matchesSearch(
      record,
      options.searchTerm,
      options.exactMatch,
      options.caseSensitive
    );
  });
}

function getValueType(value) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

function stringifyValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === undefined
  ) {
    return String(value);
  }

  const seen = new WeakSet();

  try {
    return JSON.stringify(value, function safeReplacer(key, nestedValue) {
      if (isObjectLike(nestedValue)) {
        if (seen.has(nestedValue)) {
          return "[Circular]";
        }

        seen.add(nestedValue);
      }

      return nestedValue;
    });
  } catch (error) {
    return `[Unserializable: ${error.message}]`;
  }
}

function makeSelectedItem(record, selectionType) {
  if (selectionType === "key") {
    return record.key;
  }

  if (selectionType === "path") {
    return record.path;
  }

  if (selectionType === "value") {
    return record.value;
  }

  return {
    path: record.path,
    value: record.value
  };
}

function getModeResultKind(mode) {
  if (mode === "direct_keys" || mode === "deep_keys" || mode === "matching_keys") {
    return "key";
  }

  if (mode === "direct_values" || mode === "deep_values" || mode === "matching_values") {
    return "value";
  }

  return "pair";
}

function getEffectiveSelectionType(mode, requestedSelectionType) {
  const modeResultKind = getModeResultKind(mode);

  if (modeResultKind === "key") {
    if (requestedSelectionType === "path") {
      return "path";
    }

    return "key";
  }

  if (modeResultKind === "value") {
    return "value";
  }

  return requestedSelectionType || "path_value";
}

function makeDropdownOption(record, selectionType) {
  if (selectionType === "key") {
    return {
      label: record.key,
      value: record.key
    };
  }

  if (selectionType === "path") {
    return {
      label: record.path,
      value: record.path
    };
  }

  if (selectionType === "value") {
    return {
      label: `${record.path} = ${stringifyValue(record.value)}`,
      value: record.value
    };
  }

  return {
    label: record.path,
    value: {
      path: record.path,
      value: record.value
    }
  };
}

function toPlainObject(records, selectionType) {
  return records.reduce(function buildObject(result, record) {
    result[record.path] = makeSelectedItem(record, selectionType);
    return result;
  }, {});
}

function shapeOutput(records, options) {
  const mode = options.mode || "direct_keys";
  const outputMode = options.outputMode || "selected_array";
  const selectionType = getEffectiveSelectionType(mode, options.selectionType);
  const includeValues = options.includeValues !== false;
  const modeResultKind = getModeResultKind(mode);

  // The node collects records in one standard shape, then formats them here.
  // That makes it easier to add new output styles without changing traversal.
  if (outputMode === "selected_array") {
    return records.map(function mapSelectedItem(record) {
      return makeSelectedItem(record, selectionType);
    });
  }

  if (outputMode === "array_strings") {
    return records.map(function mapString(record) {
      return stringifyValue(makeSelectedItem(record, selectionType));
    });
  }

  if (outputMode === "array_values") {
    return records.map(function mapValues(record) {
      return record.value;
    });
  }

  if (outputMode === "array_key_value") {
    return records.map(function mapKeyValue(record) {
      if (modeResultKind === "key") {
        return { key: record.key };
      }

      if (modeResultKind === "value") {
        return { value: record.value };
      }

      if (includeValues) {
        return { key: record.key, value: record.value };
      }

      return { key: record.key };
    });
  }

  if (outputMode === "array_path_key_value") {
    return records.map(function mapPathKeyValue(record) {
      if (modeResultKind === "key") {
        return { path: record.path, key: record.key };
      }

      if (modeResultKind === "value") {
        return { path: record.path, value: record.value };
      }

      if (includeValues) {
        return { path: record.path, key: record.key, value: record.value };
      }

      return { path: record.path, key: record.key };
    });
  }

  if (outputMode === "dropdown_options") {
    return records.map(function mapDropdownOption(record) {
      return makeDropdownOption(record, selectionType);
    });
  }

  if (outputMode === "plain_object") {
    return toPlainObject(records, selectionType);
  }

  if (outputMode === "first_match_only") {
    if (!records.length) {
      return null;
    }

    return makeSelectedItem(records[0], selectionType);
  }

  return records;
}

function getRecordsForMode(resolvedValue, resolvedPath, options) {
  const includeArrays = options.includeArrays !== false;
  const searchOptions = {
    searchTerm: options.searchTerm,
    exactMatch: options.exactMatch === true,
    caseSensitive: options.caseSensitive === true
  };
  const directRecords = collectRecords(resolvedValue, resolvedPath, {
    includeArrays,
    recursive: false
  });
  const deepRecords = collectRecords(resolvedValue, resolvedPath, {
    includeArrays,
    recursive: true
  });
  const scalarRecord = createScalarRecord(resolvedValue, resolvedPath);
  const mode = options.mode || "direct_keys";

  // Modes choose which records are eligible before final formatting happens.
  if (mode === "direct_keys") {
    return directRecords;
  }

  if (mode === "deep_keys") {
    return deepRecords;
  }

  if (mode === "direct_values") {
    return directRecords.length ? directRecords : [scalarRecord];
  }

  if (mode === "deep_values") {
    return deepRecords.length ? deepRecords : [scalarRecord];
  }

  if (mode === "key_value_pairs") {
    return options.recursive === true ? deepRecords : directRecords;
  }

  if (mode === "matching_keys") {
    return filterRecords(options.recursive === true ? deepRecords : directRecords, searchOptions);
  }

  if (mode === "matching_values") {
    return filterRecords(options.recursive === true ? deepRecords : directRecords, searchOptions);
  }

  if (mode === "matching_key_value_pairs") {
    return filterRecords(options.recursive === true ? deepRecords : directRecords, searchOptions);
  }

  return directRecords;
}

module.exports = {
  appendPath,
  collectRecords,
  createScalarRecord,
  filterRecords,
  getEffectiveSelectionType,
  getModeResultKind,
  getRecordsForMode,
  getValueType,
  isObjectLike,
  isTraversable,
  makeSelectedItem,
  matchesSearch,
  normalizePath,
  resolveSourceValue,
  shapeOutput,
  stringifyValue,
  tokenizePath
};
