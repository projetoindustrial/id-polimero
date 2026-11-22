# Identificador de polímeros (FT-IR)

PWA que identifica polímeros (PE, PET, PLA, PP, PS) por FT-IR/ATR direto no navegador, sem rede depois da primeira abertura.
Entradas: interferogramas (CSV do ftir_sim/firmware) ou espectro pronto (CSV).

Busca online (opcional): quem tem um Worker próprio da Cloudflare pode configurar a URL e o token na seção "Busca online" para consultar uma biblioteca maior (FTIR, Raman, NIR, NIR v2). Sem configurar, nada sai do aparelho; com ela, só o vetor pré-processado e o nome da técnica são enviados ao seu Worker. A aba Raman/NIR só funciona com a busca online configurada.

Site: https://projetoindustrial.github.io/id-polimero/

Ferramenta de pesquisa: biblioteca não calibrada para aparelho real; não use para decisões de segurança ou conformidade.
Código: MIT. Biblioteca embutida (`lib.json`): CC BY-SA 4.0, derivada de MPX_specDB e outras fontes abertas; créditos completos na própria página.
