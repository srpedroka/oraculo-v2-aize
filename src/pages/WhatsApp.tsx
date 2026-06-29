const messages = [
  {
    author: "oracle",
    time: "08:12",
    text: "Bom dia, Gui. A GAAM bateu a meta de faturamento do mês, mas a validação dos produtos premium está atrasada. O futuro está ficando descoberto.",
  },
  { author: "user", time: "08:13", text: "Resumo da área Comercial hoje" },
  {
    author: "oracle",
    time: "08:13",
    text: "Comercial: 2 objetivos do trimestre. Fechar 8 contratos premium está no prazo (50%). Subir ticket médio em 12% está em risco (30%). Quer abrir o que está em risco?",
  },
  { author: "user", time: "08:15", text: "Registrar evidência: 2 contratos premium assinados em setembro" },
  {
    author: "oracle",
    time: "08:15",
    text: "Registrado em Fechar 8 contratos premium. Faltam 6 para a meta do trimestre. Bom avanço.",
  },
  { author: "user", time: "08:16", text: "Quais objetivos estão atrasados?" },
  {
    author: "oracle",
    time: "08:16",
    text: "1 atrasado: Validar 2 protótipos premium (Inovação, Vander). A evidência prevista é o laudo de teste aprovado. Quer que eu cobre o responsável no check-in?",
  },
  { author: "oracle", time: "17:00", text: "É sexta. Vamos ao check-in da semana da sua área? Leva 2 minutos." },
];

export function WhatsApp() {
  return (
    <div className="grid min-h-[calc(100vh-6rem)] items-center gap-8 xl:grid-cols-[1fr_420px]">
      <div className="max-w-xl">
        <p className="text-sm font-medium text-text-tertiary">Visão de futuro</p>
        <h1 className="text-2xl font-semibold text-text">WhatsApp</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Demonstração estática do canal diário. A integração real vem depois; aqui nada envia mensagem nem conecta sessão.
        </p>
      </div>

      <div className="mx-auto w-full max-w-[360px] rounded-[34px] border border-[#D5D5DA] bg-[#111] p-2 shadow-card">
        <div className="overflow-hidden rounded-[28px] bg-[#E9E0D2]">
          <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">O</div>
            <div>
              <p className="text-sm font-semibold">Oráculo</p>
              <p className="text-xs text-white/75">online</p>
            </div>
          </div>

          <div className="space-y-2 px-3 py-4">
            {messages.map((message, index) => (
              <div
                key={`${message.time}-${index}`}
                className={[
                  "max-w-[82%] rounded-xl px-3 py-2 text-[13px] leading-5 shadow-sm",
                  message.author === "oracle" ? "mr-auto rounded-tl-sm bg-white" : "ml-auto rounded-tr-sm bg-[#DCF8C6]",
                ].join(" ")}
              >
                <p>{message.text}</p>
                <p className="mt-1 text-right text-[10px] text-[#66716C]">{message.time}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-black/5 bg-[#F0F0F0] px-3 py-3">
            <div className="h-9 flex-1 rounded-full bg-white px-4 py-2 text-xs text-[#66716C]">Demonstração</div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white">›</div>
          </div>
        </div>
      </div>
    </div>
  );
}
