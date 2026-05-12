import {
  Cause,
  Effect,
  Exit,
  Option,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue,
  SchemaTransformation,
} from "effect";

export const decodeJsonResult = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
) => {
  const decode = Schema.decodeExit(Schema.fromJsonString(schema));
  return (input: string) => {
    const result = decode(input);
    if (Exit.isFailure(result)) {
      return Result.fail(result.cause);
    }
    return Result.succeed(result.value);
  };
};

export const decodeUnknownJsonResult = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
) => {
  const decode = Schema.decodeUnknownExit(Schema.fromJsonString(schema));
  return (input: unknown) => {
    const result = decode(input);
    if (Exit.isFailure(result)) {
      return Result.fail(result.cause);
    }
    return Result.succeed(result.value);
  };
};

export const formatSchemaError = (cause: Cause.Cause<Schema.SchemaError>) => {
  const squashed = Cause.squash(cause);
  return Schema.isSchemaError(squashed)
    ? SchemaIssue.makeFormatterDefault()(squashed.issue)
    : Cause.pretty(cause);
};

const parseLenientJsonGetter = SchemaGetter.onSome((input: string) =>
  Effect.try({
    try: () => {
      let stripped = input.replace(
        /("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g,
        (match, stringLiteral: string | undefined) => (stringLiteral ? match : ""),
      );

      stripped = stripped.replace(
        /("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\//g,
        (match, stringLiteral: string | undefined) => (stringLiteral ? match : ""),
      );

      stripped = stripped.replace(/,(\s*[}\]])/g, "$1");

      return Option.some(JSON.parse(stripped));
    },
    catch: (error) => new SchemaIssue.InvalidValue(Option.some(input), { message: String(error) }),
  }),
);

export const fromLenientJsonString = new SchemaTransformation.Transformation(
  parseLenientJsonGetter,
  SchemaGetter.stringifyJson(),
);

export const prettyJsonString = SchemaGetter.parseJson<string>().compose(
  SchemaGetter.stringifyJson({ space: 2 }),
);

export const fromLenientJson = <S extends Schema.Top>(schema: S) =>
  Schema.String.pipe(Schema.decodeTo(schema, fromLenientJsonString));

export function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  if (start < 0) {
    return trimmed;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  return trimmed.slice(start);
}

export const fromJsonStringPretty = <S extends Schema.Top>(schema: S) =>
  Schema.fromJsonString(schema).pipe(
    Schema.encode({
      decode: prettyJsonString,
      encode: prettyJsonString,
    }),
  );
