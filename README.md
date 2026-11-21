# MotoEletrica: landing page

Landing page da loja de veículos elétricos **MotoEletrica** (Fortaleza, CE).

O destaque é o hero em 3D, controlado pelo scroll. Uma scooter elétrica, modelada em código com three.js, fica num
showroom com teto de hexágonos, igual ao da loja. Conforme a pessoa rola a página, a scooter liga o farol, mostra os
detalhes e sai acelerando. Funciona como um vídeo que avança e volta com a rolagem, e a cor escolhida no início vale
para a animação inteira.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5181
npm run build    # gera dist/
```

Em desenvolvimento, `?nointro` na URL pula a animação de entrada.

## Estrutura

- `index.html`: todas as seções e textos
- `src/scooter.js`: modelo 3D da scooter (geometria, materiais, texturas)
- `src/scene.js`: showroom, luzes, câmera e a linha do tempo do scroll (`KEYS`, `driveDistance`)
- `src/main.js`: rolagem suave, textos sincronizados, calculadora e links de WhatsApp
- `src/style.css`: visual

## Dados usados (do linktr.ee/globalmobilidade)

- WhatsApp: +55 85 8711-1213 (`WA_NUMBER` em `src/main.js`)
- Endereço (exemplo, trocar pelo real): Av. Beira Mar, 1000, Meireles, Fortaleza, CE, 60165-121
- Avaliações: https://g.page/r/CaQoow3GbLSpEBM/review

## Antes de publicar em produção

- Confirmar com a loja os textos de modelos (Global 500, AIMA Mike) e as premissas da calculadora.
- Trocar ou complementar com fotos reais dos modelos, se a loja enviar.
