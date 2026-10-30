# Passaggio di consegne — sito Chère Pochette

Stato al **29 ottobre 2026**. Una pagina per il team: cosa c'è, chi fa cosa, quali account, da dove partire.

## Cosa esiste

- **Il sito** https://cherepochette.ch in italiano, tedesco e inglese: negozio, storia, processo, team, info, note legali.
  È **online ma in anteprima**: chi lo apre deve inserire la **password dell'anteprima**. Il lancio = togliere la password.
- **L'admin** https://cherepochette.ch/admin/: dal telefono si aggiungono le borse, si segnano vendute, si esporta
  l'elenco in CSV. Accesso: e-mail del negozio + password dell'admin. → [GUIDA-ADMIN.md](GUIDA-ADMIN.md)
- **4 borse in vendita**: N° 001 Belle Bordeaux CHF 40 · N° 002 Jolie Rosa antico 45 · N° 003 Coquette Giallo 45 ·
  N° 004 Belle Grigio perla 40.
- **Ordini**: per ora **via e-mail** («Ordina via e-mail»). I **pagamenti online** (Zahls: TWINT, carte, PostFinance,
  Apple/Google Pay) sono pronti ma **spenti** finché Zahls non ha verificato il nostro conto.
- **Automazione**: ogni modifica (admin o file) pubblica il sito da sola in 1–2 minuti. Con i pagamenti attivi, una
  borsa pagata passa da sola tra le vendute.
- **Codice e documentazione**: https://github.com/Eva-azienda/chere-pochette (pubblico) → [README](../README.md) e `docs/`.
- **Cartella Drive "Website Eva"**: `01_Brief` (brief, modelli) · `02_Branding` (kit, logo, wordmark) · `03_Media`
  (foto originali) · `04_Website` (copia del codice; quella valida è su GitHub) · `05_Handover` (copia di questi documenti).
  La cartella è nel Drive di chi ha fatto il setup: chiedete di condividerla o trasferirla a un account del team.

## Chi fa cosa (proposta)

| Chi | Sul sito |
|---|---|
| **Tutte** | Usare l'admin: borse nuove, «Segna come venduta» subito dopo una vendita al mercatino o via e-mail |
| **CTO – Eva Dall'Acqua** | Responsabile del sito: GitHub, password dell'anteprima, accesso admin, token (scade il 29.10.2027), lancio, problemi di pubblicazione |
| **CFO – Selina Castelli** | Verifica Zahls (KYC), scelta del piano entro ~28.11.2026, prezzi e spedizione, pagamenti e rimborsi, CSV per la contabilità |
| **CMO – Michelle Salvi, Lara Fieschi** | Instagram (URL del profilo), foto, testi, newsletter, logo vettoriale da Canva |
| **CPO – Romina Fumi** | Borse nuove nell'admin con foto vere, consenso scritto delle signore nella foto all'uncinetto |
| **CEO – Masha Sargenti, CAO – Julia Ronchetto** | Testi legali con il coach/la scuola, indirizzo postale per l'Impressum, foto e CV del team, decisione del lancio |

## Account (nessuna password qui)

| Servizio | Account | Serve per | Accesso |
|---|---|---|---|
| GitHub | `Eva-azienda` → repository `chere-pochette` | codice, dati, pubblicazione, password dell'anteprima, chiavi | CTO |
| Hostpoint | dominio `cherepochette.ch` (+ DNS) | indirizzo del sito, rinnovo annuale | CTO / CFO |
| Zahls | istanza `cherepochette` → https://cherepochette.zahls.ch | pagamenti online, ordini, rimborsi | CFO + CTO |
| E-mail del negozio | `chere.pochette@sccbellinzona.ch` (casella della scuola) | contatti, ordini, login dell'admin | team |
| Admin | e-mail del negozio + password dell'admin | gestire le borse | tutte |
| Anteprima del sito | password dell'anteprima (segreto `SITE_PASSWORD` su GitHub) | vedere il sito prima del lancio | tutte |
| Google Drive | cartella "Website Eva" | documenti, logo, foto originali | team |

Le password si passano **solo di persona** o con un password manager, mai in chat. Quelle di **GitHub, Zahls e
Hostpoint sono state scritte in una chat durante il setup: vanno cambiate** (punto 1).

## Le prime 10 cose da fare

1. **Cambiare le password** di GitHub, Zahls e Hostpoint e attivare la verifica in due passaggi su GitHub (CTO, CFO).
2. **Verifica Zahls (KYC)**: dati della società, documento d'identità e residenza delle rappresentanti legali, dati
   dell'attività (sito, condizioni di vendita), IBAN (CFO). → [SETUP.md §7](SETUP.md#7-zahls)
3. **Scegliere il piano Zahls prima della fine della prova (~28.11.2026)** (CFO).
4. **Installare l'admin sul telefono** e provarlo (tutte). → [GUIDA-ADMIN.md](GUIDA-ADMIN.md)
5. **Prezzi veri** per modello (oggi provvisori: Jolie 45, Belle 40, Coquette 45) e **costo di spedizione** (oggi CHF 9) (CFO).
   → [CONTENT.md](CONTENT.md)
6. **Testi legali** (segnati BOZZA) rivisti dal coach/dalla scuola + **indirizzo postale** per l'Impressum (CEO, CAO).
7. **Consenso scritto** delle signore riconoscibili nella foto all'uncinetto (o foto con solo le mani) e controllo della
   frase sul filato: la foto mostra bobine di fettuccia comprate (CPO, CMO).
8. **URL del profilo Instagram** al posto del link a un post (CMO).
9. **Team**: foto, CV e competenze in `src/data/team.json` (tutte, CAO raccoglie).
10. **Dopo la verifica Zahls**: accendere i pagamenti (`checkout.enabled: true`), **acquisto di prova in CHF + rimborso**;
    poi il **lancio: cancellare il segreto `SITE_PASSWORD` e ripubblicare** (CTO). → [OPERATIONS.md §3 e §6](OPERATIONS.md)

## Da sapere

- **Token dell'admin**: scade il **29.10.2027** → rinnovarlo prima ([SETUP.md §6](SETUP.md#6-admin-access-npm-run-adminsetup)),
  altrimenti l'admin non salva più.
- **60 giorni senza modifiche** (es. vacanze estive): GitHub ferma il controllo automatico ogni 10 minuti → riattivarlo in
  GitHub → Actions → Deploy → *Enable workflow* ([OPERATIONS.md §9](OPERATIONS.md#9-scheduled-runs--caveats)).
- Sul Mac di chi ha fatto il setup la **GitHub CLI** è autorizzata per `Eva-azienda`: revocarla quando non serve più
  (GitHub → Settings → Applications).
- Cambiare la password dell'anteprima fa uscire tutti i visitatori (devono reinserirla).
- Tutto ciò che è ancora aperto: [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md).
