// De schermen van Unbreakable. Navigeren gebeurt met het deel na # in de URL.

import { api, currentUser, setUser } from './api.js';
import * as otp from './crypto.js';

const app = document.getElementById('app');

function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatDate(value) {
    return new Date(value).toLocaleString('nl-BE', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function showWho() {
    const user = currentUser();
    document.getElementById('who').innerHTML = user
        ? `Je bent <strong>${escapeHtml(user)}</strong> (<a href="#/">wisselen</a>)`
        : '';
}

// ------------------------------------------------------------------ naam kiezen

function renderLogin() {
    const user = currentUser();
    app.innerHTML = `
        <div class="text-center mb-5">
            <h1 class="display-4">Unbreakable</h1>
            <p class="lead">Berichten die niemand anders kan lezen. Dat is toch de bedoeling.</p>
        </div>
        <div class="row justify-content-center">
            <div class="col-md-5">
                ${user ? `<p>Je gebruikt Unbreakable als <strong>${escapeHtml(user)}</strong>.
                          <a href="#/inbox">Naar je inbox</a></p>
                          <p>Iemand anders? Vul hieronder een andere naam in.</p>` : ''}
                <form id="login">
                    <div class="form-group">
                        <label for="name">Wie ben je?</label>
                        <input id="name" class="form-control" placeholder="bijvoorbeeld Anna"
                               required minlength="2" maxlength="40" />
                    </div>
                    <button type="submit" class="btn btn-primary">Verder</button>
                </form>
            </div>
        </div>`;

    document.getElementById('login').addEventListener('submit', (event) => {
        event.preventDefault();
        setUser(document.getElementById('name').value.trim());
        location.hash = '#/inbox';
    });
}

// ------------------------------------------------------------------ inbox

async function renderInbox(params) {
    const user = currentUser();
    const q = params.get('q') || '';
    const from = params.get('from') || '';

    const all = await api.inbox();
    const senders = [...new Set(all.map(m => m.sender))].sort();
    const found = q ? await api.search(q) : all;
    const messages = found.filter(m => !from || m.sender === from);

    app.innerHTML = `
        <h1>Inbox van ${escapeHtml(user)}</h1>
        <p>
            <a href="#/nieuw" class="btn btn-primary">Nieuw bericht</a>
            <button id="export" class="btn btn-outline-secondary">Exporteer als JSON</button>
        </p>
        <form id="filter" class="mb-3">
            <div class="form-row align-items-end">
                <div class="col-auto">
                    <label for="from">Van</label>
                    <select id="from" class="form-control">
                        <option value="">Iedereen</option>
                        ${senders.map(s => `<option value="${escapeHtml(s)}" ${s === from ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                    </select>
                </div>
                <div class="col-auto">
                    <label for="q">Zoeken</label>
                    <input id="q" class="form-control" value="${escapeHtml(q)}" />
                </div>
                <div class="col-auto">
                    <button type="submit" class="btn btn-secondary">Filter</button>
                </div>
            </div>
        </form>
        <p id="searched"></p>
        <div id="list"></div>`;

    if (q) {
        window.jQuery('#searched').html('Je zocht naar: ' + q);
    }

    const rows = messages.map(m => `
        <tr>
            <td>${escapeHtml(m.sender)}</td>
            <td><a href="#/bericht/${m.id}">${m.subject}</a></td>
            <td>${formatDate(m.sentAt)}</td>
        </tr>`).join('');

    document.getElementById('list').innerHTML = messages.length
        ? `<table class="table">
               <thead><tr><th>Van</th><th>Onderwerp</th><th>Verzonden</th></tr></thead>
               <tbody>${rows}</tbody>
           </table>`
        : '<p class="text-muted">Geen berichten.</p>';

    document.getElementById('filter').addEventListener('submit', (event) => {
        event.preventDefault();
        const next = new URLSearchParams();
        const newQ = document.getElementById('q').value;
        const newFrom = document.getElementById('from').value;
        if (newQ) next.set('q', newQ);
        if (newFrom) next.set('from', newFrom);
        location.hash = '#/inbox' + (next.toString() ? '?' + next.toString() : '');
    });

    document.getElementById('export').addEventListener('click', async () => {
        const data = await api.exportJson();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'inbox.json';
        link.click();
        URL.revokeObjectURL(link.href);
    });
}

// ------------------------------------------------------------------ bericht lezen

function showStatus(element, type, text) {
    element.innerHTML = `<div class="alert alert-${type}"></div>`;
    element.firstElementChild.textContent = text;
}

async function renderMessage(id) {
    const m = await api.message(id);

    app.innerHTML = `
        <h1>${escapeHtml(m.subject)}</h1>
        <dl class="row">
            <dt class="col-sm-2">Van</dt><dd class="col-sm-10">${escapeHtml(m.sender)}</dd>
            <dt class="col-sm-2">Aan</dt><dd class="col-sm-10">${escapeHtml(m.recipient)}</dd>
            <dt class="col-sm-2">Verzonden</dt><dd class="col-sm-10">${formatDate(m.sentAt)}</dd>
            <dt class="col-sm-2">Codeboeklijn</dt><dd class="col-sm-10">${escapeHtml(m.keyLine)}</dd>
            <dt class="col-sm-2">Ciphertext</dt><dd class="col-sm-10"><code id="cipher"></code></dd>
        </dl>
        <form id="unlock" class="mb-3" autocomplete="off">
            <div class="form-group">
                <label for="keyline">Lijn ${escapeHtml(m.keyLine)} uit je codeboek (nummer en sleutel)</label>
                <input id="keyline" class="form-control" spellcheck="false" autocomplete="off" required />
            </div>
            <div class="form-group">
                <label for="mackey">HMAC-sleutel</label>
                <input id="mackey" type="password" class="form-control" autocomplete="off" required />
            </div>
            <button type="submit" class="btn btn-primary">Controleren en ontsleutelen</button>
        </form>
        <div id="status"></div>
        <div id="bodycard" class="card mb-3 d-none"><div class="card-body message-body" id="body"></div></div>
        <p>
            <button id="delete" class="btn btn-outline-danger">Verwijderen</button>
            <a href="#/inbox" class="btn btn-link">Terug naar je inbox</a>
        </p>`;

    document.getElementById('cipher').textContent = m.body;
    const status = document.getElementById('status');
    const bodyCard = document.getElementById('bodycard');
    const body = document.getElementById('body');

    document.getElementById('unlock').addEventListener('submit', async (event) => {
        event.preventDefault();
        bodyCard.classList.add('d-none');
        body.textContent = '';
        try {
            const { line, key } = otp.parseKeyLine(document.getElementById('keyline').value);
            if (line !== m.keyLine) {
                throw new Error(`Je plakte lijn ${line}, maar dit bericht is versleuteld met lijn ${m.keyLine}.`);
            }
            const ok = await otp.hmacVerify(document.getElementById('mackey').value, m.keyLine, m.body, m.mac);
            if (!ok) {
                throw new Error('De MAC klopt niet: het bericht is gewijzigd of de HMAC-sleutel is verkeerd. Het bericht wordt niet getoond.');
            }
            body.textContent = otp.decrypt(m.body, key).replaceAll('_', ' ');
            bodyCard.classList.remove('d-none');
            showStatus(status, 'success', 'MAC gecontroleerd: het bericht is niet gewijzigd.');
        } catch (error) {
            showStatus(status, 'danger', error.message);
        }
    });

    document.getElementById('delete').addEventListener('click', async () => {
        if (confirm('Ben je zeker dat je dit bericht wil verwijderen?')) {
            await api.remove(id);
            location.hash = '#/inbox';
        }
    });
}

// ------------------------------------------------------------------ bericht versturen

async function renderNew() {
    const users = await api.users();

    app.innerHTML = `
        <h1>Nieuw bericht</h1>
        <p class="text-muted">Van: ${escapeHtml(currentUser())}</p>
        <div class="row">
            <div class="col-md-8">
                <form id="compose" autocomplete="off">
                    <div class="form-group">
                        <label for="recipient">Aan</label>
                        <input id="recipient" class="form-control" list="known-users" autocomplete="off"
                               required minlength="2" maxlength="40" />
                        <datalist id="known-users">
                            ${users.map(u => `<option value="${escapeHtml(u)}"></option>`).join('')}
                        </datalist>
                    </div>
                    <div class="form-group">
                        <label for="text">Bericht</label>
                        <textarea id="text" class="form-control" rows="3" required></textarea>
                        <small class="form-text text-muted">Wordt versleuteld als: <code id="preview"></code> <span id="count"></span></small>
                    </div>
                    <div class="form-group">
                        <label for="keyline">Lijn uit je codeboek (nummer en sleutel)</label>
                        <input id="keyline" class="form-control" spellcheck="false" autocomplete="off" required />
                    </div>
                    <div class="form-group">
                        <label for="mackey">HMAC-sleutel</label>
                        <input id="mackey" type="password" class="form-control" autocomplete="off" required />
                    </div>
                    <div id="status"></div>
                    <button type="submit" class="btn btn-primary">Versleutelen en versturen</button>
                    <a href="#/inbox" class="btn btn-link">Annuleren</a>
                </form>
            </div>
        </div>`;

    const text = document.getElementById('text');
    const keyline = document.getElementById('keyline');
    const preview = document.getElementById('preview');
    const count = document.getElementById('count');
    const status = document.getElementById('status');

    function updatePreview() {
        const { result, rejected } = otp.normalize(text.value);
        preview.textContent = result;
        let limit = 40;
        try {
            limit = otp.parseKeyLine(keyline.value).key.length;
        } catch {
        }
        count.textContent = `(${[...result].length} / ${limit} tekens)`;
        if (rejected.length) {
            showStatus(status, 'warning', 'Deze tekens kunnen niet verstuurd worden: ' + rejected.join(', '));
        } else {
            status.innerHTML = '';
        }
    }

    text.addEventListener('input', updatePreview);
    keyline.addEventListener('input', updatePreview);
    updatePreview();

    document.getElementById('compose').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            const { result, rejected } = otp.normalize(text.value);
            if (rejected.length) {
                throw new Error('Deze tekens kunnen niet verstuurd worden: ' + rejected.join(', '));
            }
            if (result.length === 0) {
                throw new Error('Het bericht is leeg.');
            }
            const { line, key } = otp.parseKeyLine(keyline.value);
            const body = otp.encrypt(result, key);
            const mac = await otp.hmacSign(document.getElementById('mackey').value, line, body);
            await api.send({
                recipient: document.getElementById('recipient').value.trim(),
                subject: 'Versleuteld bericht',
                body,
                keyLine: line,
                mac,
            });
            location.hash = '#/inbox';
        } catch (error) {
            showStatus(status, 'danger', error.message);
        }
    });
}

// ------------------------------------------------------------------ over

function renderAbout() {
    app.innerHTML = `
        <h1>Over Unbreakable</h1>
        <p>Unbreakable is een berichtenapp. Je stuurt een bericht naar iemand, en enkel die persoon kan het lezen.
           Dat is tenminste het doel.</p>
        <p>Deze versie is de starter app van het vak Cyber Security Advanced aan AP Hogeschool.
           Ze werkt, maar is nog helemaal niet veilig. Doorheen het semester maken jullie ze beter.</p>
        <p>De app bestaat uit twee delen: deze single page app in je browser, en een API op de server.
           Bekijk de developer tools van je browser om te zien wat er over en weer gaat.</p>
        <p class="text-danger">Gebruik deze app enkel in je eigen labomgeving en nooit met echte gegevens.</p>`;
}

// ------------------------------------------------------------------ navigatie

async function route() {
    showWho();

    const [path, query] = (location.hash || '#/').slice(1).split('?');
    const params = new URLSearchParams(query || '');

    try {
        if (path === '/' || path === '') {
            return renderLogin();
        }
        if (path === '/over') {
            return renderAbout();
        }
        if (!currentUser()) {
            location.hash = '#/';
            return;
        }
        if (path === '/inbox') {
            return await renderInbox(params);
        }
        if (path === '/nieuw') {
            return await renderNew();
        }
        const match = path.match(/^\/bericht\/(\d+)$/);
        if (match) {
            return await renderMessage(match[1]);
        }
        app.innerHTML = '<p>Deze pagina bestaat niet.</p>';
    } catch (error) {
        app.innerHTML = `<div class="alert alert-danger">Er liep iets mis: ${escapeHtml(error.message)}</div>`;
    }
}

window.addEventListener('hashchange', route);
route();
