import { z } from "zod";

/**
 * The contract for a documentation analysis. This schema is the single source
 * of truth: it validates the LLM's JSON output and its field names are echoed
 * into the prompt so the model knows exactly what to produce. Optional/array
 * fields default to empty so rendering never has to guard against undefined.
 */

const ParameterSchema = z.object({
  name: z.string(),
  required: z.boolean().default(false),
  type: z.string().optional(),
  description: z.string().optional(),
});

const ApiSchema = z.object({
  signature: z.string(),
  description: z.string().optional(),
  parameters: z.array(ParameterSchema).default([]),
  returns: z.string().optional(),
});

const ExampleSchema = z.object({
  title: z.string().optional(),
  language: z.string().optional(),
  code: z.string(),
});

const ErrorSchema = z.object({
  code: z.string(),
  meaning: z.string(),
});

export const AnalysisSchema = z.object({
  library: z.string(),
  purpose: z.string(),
  installation: z.array(z.string()).default([]),
  authentication: z.string().optional(),
  coreApis: z.array(ApiSchema).default([]),
  examples: z.array(ExampleSchema).default([]),
  limitations: z.array(z.string()).default([]),
  errors: z.array(ErrorSchema).default([]),
  dependencies: z.array(z.string()).default([]),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

/**
 * A compact, human-readable description of the required JSON shape, embedded in
 * the prompt. Kept next to the schema so the two never drift.
 */
export const ANALYSIS_JSON_SHAPE = `{
  "library": string,                     // the library/API name
  "purpose": string,                     // one or two sentences, technical, no marketing
  "installation": string[],              // exact install/setup commands or steps
  "authentication": string,              // how auth works, or "None" if not required
  "coreApis": [
    {
      "signature": string,               // e.g. "createClient(options)"
      "description": string,             // what it does, terse
      "parameters": [
        { "name": string, "required": boolean, "type": string, "description": string }
      ],
      "returns": string
    }
  ],
  "examples": [
    { "title": string, "language": string, "code": string }
  ],
  "limitations": string[],               // rate limits, size caps, unsupported features
  "errors": [
    { "code": string, "meaning": string } // e.g. { "code": "401", "meaning": "Invalid API key" }
  ],
  "dependencies": string[]               // required runtime/peer dependencies
}`;
