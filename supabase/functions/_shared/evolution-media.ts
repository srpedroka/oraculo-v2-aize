export interface EvolutionMediaSource {
  rawMessage: unknown;
  rawData: unknown;
  messageId: string;
  key: Record<string, unknown>;
  mediaKey?: string;
  directPath?: string;
  url?: string;
  mimeType: string;
  kind: "audio" | "document";
}

export interface EvolutionMediaAttempt {
  endpoint: string;
  body: Record<string, unknown>;
}

export function buildEvolutionMediaAttempts(baseUrl: string, instanceName: string, source: EvolutionMediaSource) {
  const currentEndpoint = `${baseUrl}/message/downloadmedia`;
  const legacyGoEndpoint = `${baseUrl}/message/downloadimage`;
  const legacyNodeEndpoints = [
    `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
    `${baseUrl}/message/getBase64FromMediaMessage/${instanceName}`,
    `${baseUrl}/chat/getBase64FromMediaMessage`,
  ];
  const currentBody = { message: source.rawMessage };
  const compatibilityBodies = [
    currentBody,
    {
      instance: instanceName,
      message: source.rawData,
      messageId: source.messageId,
      key: source.key,
      convertToMp4: false,
    },
    {
      message: { key: source.key, message: source.rawMessage },
      convertToMp4: false,
    },
    {
      messageId: source.messageId,
      key: source.key,
      convertToMp4: false,
    },
    {
      remoteJid: source.key.remoteJid,
      messageId: source.messageId,
      id: source.messageId,
      fromMe: source.key.fromMe,
      convertToMp4: false,
    },
    {
      instance: instanceName,
      mediaKey: source.mediaKey,
      directPath: source.directPath,
      url: source.url,
      mimetype: source.mimeType,
      type: source.kind,
      convertToMp4: false,
    },
  ];

  return [
    { endpoint: currentEndpoint, body: currentBody },
    ...compatibilityBodies.map((body) => ({ endpoint: legacyGoEndpoint, body })),
    ...legacyNodeEndpoints.flatMap((endpoint) => compatibilityBodies.map((body) => ({ endpoint, body }))),
  ] satisfies EvolutionMediaAttempt[];
}
