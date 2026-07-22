export function isTransientLocalEdgeRuntimeFailure(output: string) {
  return output.includes("UND_ERR_SOCKET") && output.includes("other side closed");
}
