# Aanvaarde bevindingen

Bevindingen uit de eerste runs van de pipeline op de ongewijzigde starter app, die we bewust nu niet oplossen. Per bevinding: de tool, of het een echt probleem of een false positive is, en waarom dat nu kan. De bevindingen staan als uitzondering in `.gitleaksignore`, `.trivyignore` en (voor CodeQL) als "Won't fix" in het Security-tabblad van GitHub.

## 1. Databankwachtwoord in de code (Gitleaks)

- **Waar:** `docker-compose.yml` (regel 7 en 17) en `app/appsettings.json` (regel 11), in de eerste commit en twee latere commits op `dev`.
- **Oordeel:** echt probleem. Een wachtwoord hoort niet in een publieke repository.
- **Waarom kan het nu:** de waarde is het seedwachtwoord uit de publieke template van de lector en was dus al publiek. De databank publiceert geen poort, ze is alleen bereikbaar in het Docker-netwerk van de app. Vanaf de uitrol gebruikt de pipeline een nieuw wachtwoord uit GitHub Secrets, zodat de waarde in de history nergens meer geldig is. In opdracht 6 verhuist het geheim naar OpenBao.

## 2. API key in `app/appsettings.json` (Gitleaks)

- **Waar:** `app/appsettings.json`, regel 15 (`Notifications:ApiKey`).
- **Oordeel:** false positive. De string ziet eruit als een key, maar het endpoint staat op het domein `push.unbreakable.example`. Het topniveaudomein `.example` is gereserveerd en bestaat niet, dus de key werkt bij geen enkele dienst.
- **Waarom kan het nu:** er is geen echt geheim dat kan lekken. Krijgt de app ooit een echte notificatiedienst, dan komt die key in een secret store en niet in de code.

## 3. SQL injection in de zoekfunctie (CodeQL)

- **Waar:** `app/Program.cs`, `/api/messages/search`. CodeQL-regel "SQL query built from user-controlled sources": de zoekterm wordt in een SQL-string geplakt die naar `FromSqlRaw` gaat.
- **Oordeel:** echt probleem. Lokaal aangetoond: met een injectie leest een gebruiker ook berichten die niet voor hem bedoeld zijn.
- **Waarom kan het nu:** de opdracht laat de bewust zwakke plekken van de starter app nu nog bestaan, en de databank bevat alleen testgegevens. De WAF houdt gangbare vormen tegen, maar niet elke vorm (zie het verslag van opdracht 2), dus de WAF lost het niet op. Het herstel is een geparametriseerde query.

## 4. CVE-2024-21907 in Newtonsoft.Json 12.0.1 (Trivy)

- **Waar:** `app/Unbreakable.csproj`, rechtstreekse dependency `Newtonsoft.Json` 12.0.1. Ernst High (CVSS 7.5): denial of service via diep geneste JSON. Opgelost in 13.0.1.
- **Oordeel:** echt probleem in de bibliotheek.
- **Waarom kan het nu:** de app gebruikt de bibliotheek alleen om in `/api/messages/export` een lijst berichten te serialiseren. Dat zijn platte objecten met vaste velden, dus een aanvaller kan geen diep geneste structuur aanleveren. Dat is een inschatting uit de code, niet getest. De uitzondering vervalt op 31 december 2026. Een upgrade naar 13.0.1 overwegen we, na opdracht 2.
