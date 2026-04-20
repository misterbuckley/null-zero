import { z } from "zod";
import type { Gateway } from "./gateway.js";
import type { CompletionReq } from "./types.js";

export async function jsonComplete<T>(
  gateway: Gateway,
  req: Omit<CompletionReq, "jsonSchema">,
  schema: z.ZodType<T>,
): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });

  const res = await gateway.complete({
    ...req,
    jsonSchema: jsonSchema as object,
  });

  if (res.json === undefined) {
    throw new Error("gateway returned no json payload");
  }
  return schema.parse(res.json);
}
