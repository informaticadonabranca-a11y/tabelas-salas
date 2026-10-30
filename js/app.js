import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot }
    from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut }
    from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ===== CONFIGURAÇÕES =====
const TURNO = document.body.dataset.turno;
const CONFIG_POR_TURNO = {
    manha: { sufixo: 'Manhã', aulas: [1, 2, 3, 4, 5, 6] },
    tarde: { sufixo: 'Tarde', aulas: [1, 2, 3, 4, 5] }
};
const config = CONFIG_POR_TURNO[TURNO];

const firebaseConfig = {
  apiKey: "AIzaSyA2TkDJCfh4tp55bnxV3SUwClihYVmAd3U",
  authDomain: "tabelas-salas-4f49c.firebaseapp.com",
  projectId: "tabelas-salas-4f49c",
  storageBucket: "tabelas-salas-4f49c.firebasestorage.app",
  messagingSenderId: "264753669194",
  appId: "1:264753669194:web:51cc2a78e852647cf632b3"
};

const EMAIL_ADMIN = "informaticadonabranca@gmail.com";
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const SALAS = [
    { id: 'sala-informatica', nome: `Sala de Informática - ${config.sufixo}` },
    { id: 'multiuso',         nome: `Multiuso - ${config.sufixo}` },
    { id: 'itinerante',       nome: `Itinerante - ${config.sufixo}` }
];
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const DATAS = ['28/09', '29/09', '30/09', '01/10', '02/10'];
const MAX_SEMANAS = 4;
const MIN_SEMANAS = 1;
const AULAS = config.aulas;

let usuarioAtual = null;
let isAdmin = false;
let estadosSemanas = {};
let totalSemanasPorSala = {};

function atualizarStatus(texto, tipo) {
    const el = document.getElementById('status');
    el.textContent = texto;
    el.className = 'status ' + tipo;
}

function gerarTabelas() {
    const container = document.getElementById('tabelas');
    container.innerHTML = '';

    SALAS.forEach(sala => {
        const div = document.createElement('div');
        div.className = 'tabela-container';

        const headerTabela = document.createElement('div');
        headerTabela.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;';

        const h2 = document.createElement('h2');
        h2.textContent = sala.nome;
        h2.style.margin = '0';
        h2.style.flex = '1';
        h2.style.textAlign = 'center';
        headerTabela.appendChild(h2);

        const btnLimparTabela = document.createElement('button');
        btnLimparTabela.textContent = '🗑️ Limpar Tabela';
        btnLimparTabela.className = 'btn-limpar-tabela';
        btnLimparTabela.style.display = 'none';
        btnLimparTabela.onclick = () => limparTabela(sala.id);
        headerTabela.appendChild(btnLimparTabela);

        div.appendChild(headerTabela);

        const table = document.createElement('table');
        table.className = sala.id;
        const tbody = document.createElement('tbody');

        const chaveSala = `${TURNO}_${sala.id}`;
        const totalBlocos = totalSemanasPorSala[chaveSala] || MAX_SEMANAS;

        for (let b = 0; b < totalBlocos; b++) {
            const trTitulo = document.createElement('tr');
            trTitulo.className = 'linha-titulo-semana';
            trTitulo.dataset.bloco = b;
            trTitulo.dataset.sala = sala.id;
            trTitulo.innerHTML = `
                <td colspan="6" style="background:#f0f0f0; padding:6px 10px; text-align:right;">
                    <span style="float:left; font-weight:bold; color:#333;">📅 Semana ${b + 1} - ${sala.nome}</span>
                    <button class="btn-toggle-semana" data-bloco="${b}" data-sala="${sala.id}" style="display:none; padding:4px 10px; background:#2e7d32; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold; margin-right:6px;">🔓 Liberada</button>
                    <button class="btn-limpar-semana" data-bloco="${b}" data-sala="${sala.id}" style="display:none; padding:4px 10px; background:#f57c00; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold; margin-right:6px;">🧹 Limpar</button>
                    <button class="btn-apagar-semana" data-bloco="${b}" data-sala="${sala.id}" data-total="${totalBlocos}" style="display:none; padding:4px 10px; background:#c62828; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">🗑️ Apagar</button>
                </td>`;
            tbody.appendChild(trTitulo);

            const trCab = document.createElement('tr');
            let htmlCab = `<th>Aula</th>`;
            DIAS.forEach((dia, i) => {
                const dataId = `${TURNO}_${sala.id}_bloco${b}_data_dia${i}`;
                htmlCab += `
                    <th class="th-cabecalho-dia">
                        <div class="nome-dia">${dia}</div>
                        <div class="data-dia" contenteditable="true" data-id="${dataId}" data-tipo="data">📅 ${DATAS[i]}</div>
                    </th>`;
            });
            trCab.innerHTML = htmlCab;
            tbody.appendChild(trCab);

            AULAS.forEach(n => {
                const tr = document.createElement('tr');
                tr.className = 'linha-aula';
                let html = `<td class="coluna-aula">${n}</td>`;
                DIAS.forEach((dia, i) => {
                    const celulaId = `${TURNO}_${sala.id}_bloco${b}_aula${n}_dia${i}`;
                    html += `<td contenteditable="true" data-id="${celulaId}" data-sala="${sala.id}"></td>`;
                });
                tr.innerHTML = html;
                tbody.appendChild(tr);
            });

            if (b < totalBlocos - 1) {
                const trSep = document.createElement('tr');
                trSep.className = 'linha-separadora';
                trSep.innerHTML = `<td colspan="6"></td>`;
                tbody.appendChild(trSep);
            }
        }

        table.appendChild(tbody);
        div.appendChild(table);

        const btnAdd = document.createElement('button');
        btnAdd.className = 'btn-adicionar-semana';
        btnAdd.dataset.sala = sala.id;
        btnAdd.textContent = '➕ Adicionar Semana';
        btnAdd.style.cssText = 'display:none; margin-top:15px; padding:10px 20px; background:#2e7d32; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size:13px; width:100%;';
        btnAdd.onclick = () => adicionarSemana(sala.id);
        div.appendChild(btnAdd);

        container.appendChild(div);
    });
}

function aplicarDados(dados) {
    document.querySelectorAll('td[data-id], .data-dia[data-id]').forEach(celula => {
        const id = celula.dataset.id;
        const dado = dados[id];
        const ehData = celula.dataset.tipo === 'data';

        celula.classList.remove('bloqueada', 'admin-pode-editar');

        if (dado && dado.conteudo) {
            celula.textContent = dado.conteudo;
            const ehDono = dado.dono && dado.dono === usuarioAtual;

            if (isAdmin) {
                celula.contentEditable = 'true';
                if (!ehData) celula.classList.add('admin-pode-editar');
                celula.title = '👑 Você (admin) pode editar';
            } else if (ehData) {
                celula.contentEditable = 'false';
                celula.title = 'Apenas o admin pode alterar as datas';
            } else if (!isSemanaLiberada(celula.dataset.id)) {
                celula.contentEditable = 'false';
                celula.classList.add('bloqueada');
                celula.title = '🔒 Semana bloqueada pelo administrador';
            } else if (ehDono) {
                celula.contentEditable = 'true';
                celula.title = 'Você criou — pode editar';
            } else {
                celula.contentEditable = 'false';
                celula.classList.add('bloqueada');
                celula.title = 'Preenchido por outra pessoa';
            }
        } else {
            if (ehData) {
                const match = id.match(/data_dia(\d+)$/);
                if (match) {
                    const idx = parseInt(match[1]);
                    celula.textContent = '📅 ' + (DATAS[idx] || '');
                }
                if (isAdmin) {
                    celula.contentEditable = 'true';
                    celula.title = '👑 Você (admin) pode editar a data';
                } else {
                    celula.contentEditable = 'false';
                    celula.title = 'Apenas o admin pode alterar as datas';
                }
            } else {
                celula.textContent = '';
                if (!isAdmin && !isSemanaLiberada(celula.dataset.id)) {
                    celula.contentEditable = 'false';
                    celula.classList.add('bloqueada');
                    celula.title = '🔒 Semana bloqueada pelo administrador';
                } else {
                    celula.contentEditable = 'true';
                    celula.title = '';
                }
            }
        }
    });
}

async function salvarCelula(celula) {
    const id = celula.dataset.id;
    const conteudo = celula.textContent.trim();
    const dono = usuarioAtual;
    const conteudoOriginal = celula.dataset.valorOriginal || '';

    if (!dono) return;

    const match = id.match(/^(manha|tarde)_([a-z-]+)_bloco(\d+)_/);
    if (!match) return;

    const turno = match[1];
    const sala = match[2];
    const bloco = parseInt(match[3]);

    try {
        const docRef = doc(db, "celulas", id);
        if (conteudo === '') {
            await deleteDoc(docRef);
        } else {
            try {
                await updateDoc(docRef, { conteudo });
            } catch (e) {
                await setDoc(docRef, { conteudo, dono, turno, sala, bloco });
            }
        }
    } catch (erro) {
        console.error("Erro ao salvar (sem permissão):", erro);
        celula.textContent = conteudoOriginal;
    }
}

function configurarEdicao() {
    document.querySelectorAll('td[data-id], .data-dia[data-id]').forEach(celula => {
        celula.addEventListener('focus', () => {
            celula.dataset.valorOriginal = celula.textContent;
        });
        celula.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); celula.blur(); }
        });
        celula.addEventListener('blur', () => {
            salvarCelula(celula);
            if (celula.dataset.tipo === 'data' && isAdmin) {
                atualizarTabelaInteira(celula);
            }
        });
    });

    document.querySelectorAll('.btn-limpar-semana').forEach(btn => {
        btn.onclick = () => {
            const bloco = parseInt(btn.dataset.bloco);
            const sala = btn.dataset.sala;
            limparSemana(sala, bloco);
        };
    });

    document.querySelectorAll('.btn-toggle-semana').forEach(btn => {
        btn.onclick = () => {
            const bloco = parseInt(btn.dataset.bloco);
            const sala = btn.dataset.sala;
            toggleSemana(sala, bloco);
        };
    });

    document.querySelectorAll('.btn-apagar-semana').forEach(btn => {
        btn.onclick = () => {
            const bloco = parseInt(btn.dataset.bloco);
            const sala = btn.dataset.sala;
            const total = parseInt(btn.dataset.total);
            apagarSemana(sala, bloco, total);
        };
    });
}

let unsubscribeSnapshot = null;
let unsubscribeSemanas = null;

function ouvirMudancas() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    unsubscribeSnapshot = onSnapshot(collection(db, "celulas"), (snapshot) => {
        const dados = {};
        snapshot.forEach(doc => { dados[doc.id] = doc.data(); });
        aplicarDados(dados);
    });

    if (unsubscribeSemanas) unsubscribeSemanas();
    unsubscribeSemanas = onSnapshot(collection(db, "semanas"), (snapshot) => {
        snapshot.forEach(doc => {
            estadosSemanas[doc.id] = doc.data().liberada !== false;
        });

        document.querySelectorAll('.btn-toggle-semana').forEach(btn => {
            const sala = btn.dataset.sala;
            const bloco = parseInt(btn.dataset.bloco);
            const semanaId = `${TURNO}_${sala}_bloco${bloco}`;
            const liberada = estadosSemanas[semanaId] !== false;
            atualizarUISemana(sala, bloco, liberada);
        });

        getDocs(collection(db, "celulas")).then(snap => {
            const dados = {};
            snap.forEach(doc => { dados[doc.id] = doc.data(); });
            aplicarDados(dados);
        });
    });
}

window.loginGoogle = async function() {
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); }
    catch (e) { alert("Erro ao fazer login: " + e.message); }
};

window.logoutAdmin = async function() {
    try { await signOut(auth); location.reload(); }
    catch (e) { alert("Erro ao sair: " + e.message); }
};

window.entrarVisualizacao = async function() {
    const container = document.getElementById('tabelas');

    if (container.children.length === 0 || !container.querySelector('table')) {
        try {
            const configSnap = await getDocs(collection(db, "config"));
            configSnap.forEach(doc => {
                const chave = doc.id.replace('_totalSemanas', '');
                totalSemanasPorSala[chave] = doc.data().total || MAX_SEMANAS;
            });
            SALAS.forEach(sala => {
                const chave = `${TURNO}_${sala.id}`;
                if (totalSemanasPorSala[chave] === undefined) totalSemanasPorSala[chave] = MAX_SEMANAS;
            });

            container.innerHTML = '';
            gerarTabelas();

            const snapshot = await getDocs(collection(db, "celulas"));
            const dados = {};
            snapshot.forEach(doc => { dados[doc.id] = doc.data(); });
            aplicarDadosVisualizacao(dados);
        } catch (e) { console.warn('Não foi possível carregar:', e); }
    }

    document.body.classList.add('modo-visualizacao');
    document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        el.dataset.editavelOriginal = 'true';
        el.contentEditable = 'false';
    });

    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => { console.warn(err); });
    }
};

window.sairVisualizacao = function() {
    document.body.classList.remove('modo-visualizacao');

    if (!usuarioAtual) {
        document.getElementById('tabelas').innerHTML = '';
        mostrarTelaLogin();
    } else {
        document.querySelectorAll('[data-editavel-original="true"]').forEach(el => {
            el.contentEditable = 'true';
            delete el.dataset.editavelOriginal;
        });
    }

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => { console.warn(err); });
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('modo-visualizacao')) {
        sairVisualizacao();
    }
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('modo-visualizacao')) {
        document.body.classList.remove('modo-visualizacao');
    }
});

function aplicarDadosVisualizacao(dados) {
    document.querySelectorAll('td[data-id], .data-dia[data-id]').forEach(celula => {
        const id = celula.dataset.id;
        const dado = dados[id];
        const ehData = celula.dataset.tipo === 'data';
        celula.classList.remove('bloqueada', 'admin-pode-editar');

        if (dado && dado.conteudo) {
            celula.textContent = dado.conteudo;
        } else {
            if (ehData) {
                const match = id.match(/data_dia(\d+)$/);
                if (match) {
                    const idx = parseInt(match[1]);
                    celula.textContent = '📅 ' + (DATAS[idx] || '');
                }
            } else {
                celula.textContent = '';
            }
        }
        celula.contentEditable = 'false';
    });
}

async function iniciar() {
    atualizarStatus("🔐 Conecte-se com sua conta Google", "offline");
    onAuthStateChanged(auth, async (user) => {
        if (user) { await verificarAcesso(user); }
        else { mostrarTelaLogin(); }
    });
}

async function verificarAcesso(user) {
    try {
        atualizarStatus("🔐 Verificando acesso...", "offline");
        const docRef = doc(db, "allowlist", user.email);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            usuarioAtual = user.uid;
            isAdmin = (user.email === EMAIL_ADMIN);

            document.getElementById('btnLogin').style.display = 'none';
            document.getElementById('btnLogout').style.display = 'inline-block';

            if (isAdmin) {
                atualizarStatus("👑 ADMIN — você pode editar qualquer célula", "admin");
            } else {
                atualizarStatus("✅ Conectado — você pode adicionar em células vazias e editar as que criou", "online");
            }

            const configSnap = await getDocs(collection(db, "config"));
            configSnap.forEach(doc => {
                const chave = doc.id.replace('_totalSemanas', '');
                totalSemanasPorSala[chave] = doc.data().total || MAX_SEMANAS;
            });
            SALAS.forEach(sala => {
                const chave = `${TURNO}_${sala.id}`;
                if (totalSemanasPorSala[chave] === undefined) totalSemanasPorSala[chave] = MAX_SEMANAS;
            });

            const semanasSnap = await getDocs(collection(db, "semanas"));
            semanasSnap.forEach(doc => { estadosSemanas[doc.id] = doc.data().liberada !== false; });

            const container = document.getElementById('tabelas');
            container.innerHTML = '';
            gerarTabelas();
            configurarEdicao();

            if (isAdmin) {
                const btnAdmin = document.querySelector('.btn-admin');
                if (btnAdmin) btnAdmin.style.display = 'inline-block';
                document.querySelectorAll('.btn-limpar-tabela').forEach(b => b.style.display = 'inline-block');
                document.querySelectorAll('.btn-limpar-semana').forEach(b => b.style.display = 'inline-block');
                document.querySelectorAll('.btn-toggle-semana').forEach(b => b.style.display = 'inline-block');
                document.querySelectorAll('.btn-apagar-semana').forEach(b => b.style.display = 'inline-block');
                document.querySelectorAll('.btn-adicionar-semana').forEach(b => b.style.display = 'inline-block');
            }

            const snapshot = await getDocs(collection(db, "celulas"));
            const dados = {};
            snapshot.forEach(doc => { dados[doc.id] = doc.data(); });
            aplicarDados(dados);

            ouvirMudancas();

        } else {
            console.warn("E-mail não autorizado:", user.email);
            atualizarStatus("❌ Seu e-mail não está autorizado. Escolha outra conta.", "offline");
            await signOut(auth);
            mostrarTelaLogin();
        }
    } catch (erro) {
        console.error("Erro ao verificar acesso:", erro);
        atualizarStatus("❌ Erro ao verificar acesso. Escolha uma conta.", "offline");
        try { await signOut(auth); } catch (e) {}
        mostrarTelaLogin();
    }
}

function mostrarTelaLogin() {
    document.getElementById('tabelas').innerHTML = `
        <div style="text-align:center; padding:60px 40px; background:white; border-radius:8px; max-width:500px; margin:30px auto; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
            <h2>🔐 Acesso Restrito</h2>
            <p>Este sistema é restrito a usuários autorizados.</p>
            <p>Faça login com sua conta Google para continuar.</p>
            <button onclick="loginGoogle()" style="margin-top:20px; padding:12px 24px; font-size:16px; cursor:pointer; background:#4285f4; color:white; border:none; border-radius:5px; font-weight:bold;">
                🔑 Entrar com Google
            </button>
        </div>
    `;
    document.getElementById('btnLogin').style.display = 'none';
    document.getElementById('btnLogout').style.display = 'none';
}

window.abrirPainelAdmin = async function() {
    if (!isAdmin) return;
    document.getElementById('painel-admin').style.display = 'block';
    await carregarListaEmails();
};

window.fecharPainelAdmin = function() {
    document.getElementById('painel-admin').style.display = 'none';
};

async function carregarListaEmails() {
    const container = document.getElementById('lista-emails');
    container.innerHTML = 'Carregando...';

    try {
        const snapshot = await getDocs(collection(db, "allowlist"));
        if (snapshot.empty) {
            container.innerHTML = '<p style="color:#999;">Nenhum e-mail autorizado ainda.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const email = doc.id;
            const ehAdmin = (email === EMAIL_ADMIN);
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee;">
                    <span>${email} ${ehAdmin ? '👑' : ''}</span>
                    ${!ehAdmin ? `<button onclick="removerEmail('${email}')" style="padding:4px 10px; background:#c62828; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px;">Remover</button>` : ''}
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red;">Erro ao carregar lista.</p>';
    }
}

window.adicionarEmail = async function() {
    const input = document.getElementById('novo-email');
    const email = input.value.trim().toLowerCase();
    if (!email || !email.includes('@')) { alert('Digite um e-mail válido.'); return; }
    try {
        await setDoc(doc(db, "allowlist", email), {
            email: email, addedAt: new Date().toISOString(), addedBy: EMAIL_ADMIN
        });
        input.value = '';
        await carregarListaEmails();
    } catch (e) { console.error(e); alert('Erro ao adicionar e-mail.'); }
};

window.removerEmail = async function(email) {
    if (!confirm(`Remover o acesso de ${email}?`)) return;
    try {
        await deleteDoc(doc(db, "allowlist", email));
        await carregarListaEmails();
    } catch (e) { console.error(e); alert('Erro ao remover e-mail.'); }
};

document.addEventListener('input', (e) => {
    if (e.target.matches('td[contenteditable="true"]')) {
        const MAX = 20;
        if (e.target.textContent.length > MAX) {
            e.target.textContent = e.target.textContent.slice(0, MAX);
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(e.target);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
});

async function atualizarTabelaInteira(celulaEditada) {
    const id = celulaEditada.dataset.id;
    const texto = celulaEditada.textContent.replace('📅', '').trim();
    const dataEditada = parseData(texto);
    if (!dataEditada) return;

    const match = id.match(/^(manha|tarde)_([a-z-]+)_bloco(\d+)_data_dia(\d+)$/);
    if (!match) return;

    const turno = match[1];
    const sala = match[2];
    const diaEditado = parseInt(match[4]);

    const segunda = new Date(dataEditada);
    segunda.setDate(segunda.getDate() - diaEditado);

    const todasDatas = [];
    let dataAtual = new Date(segunda);

    for (let s = 0; s < 4; s++) {
        for (let d = 0; d < 5; d++) {
            todasDatas.push(new Date(dataAtual));
            dataAtual.setDate(dataAtual.getDate() + 1);
            while (dataAtual.getDay() === 0 || dataAtual.getDay() === 6) {
                dataAtual.setDate(dataAtual.getDate() + 1);
            }
        }
    }

    for (let i = 0; i < todasDatas.length; i++) {
        const semana = Math.floor(i / 5);
        const dia = i % 5;
        const dataId = `${turno}_${sala}_bloco${semana}_data_dia${dia}`;
        const valor = '📅 ' + formatarData(todasDatas[i]);
        try {
            await setDoc(doc(db, "celulas", dataId), {
                conteudo: valor, dono: usuarioAtual, turno, sala, bloco: semana
            }, { merge: true });
        } catch (e) { console.error(e); }
    }
}

function parseData(texto) {
    const limpo = texto.replace(/[^\d\/-]/g, '');
    const partes = limpo.split(/[\/-]/);
    if (partes.length < 2) return null;
    const dia = parseInt(partes[0]);
    const mes = parseInt(partes[1]) - 1;
    const ano = partes[2] ? parseInt(partes[2]) : new Date().getFullYear();
    if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;
    const data = new Date(ano, mes, dia);
    if (isNaN(data.getTime())) return null;
    return data;
}

function formatarData(d) {
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}`;
}

async function limparTabela(salaId) {
    if (!confirm(`⚠️ Limpar TODAS as células da tabela "${salaId}"?`)) return;
    const prefixo = `${TURNO}_${salaId}_`;
    try {
        const snapshot = await getDocs(collection(db, "celulas"));
        for (const d of snapshot.docs) {
            if (d.id.startsWith(prefixo)) await deleteDoc(doc(db, "celulas", d.id));
        }
    } catch (e) { console.error(e); alert("Erro ao limpar tabela."); }
}

async function limparSemana(salaId, bloco) {
    if (!confirm(`⚠️ Limpar a Semana ${bloco + 1} da tabela "${salaId}"?`)) return;
    const prefixo = `${TURNO}_${salaId}_bloco${bloco}_`;
    try {
        const snapshot = await getDocs(collection(db, "celulas"));
        for (const d of snapshot.docs) {
            if (d.id.startsWith(prefixo)) await deleteDoc(doc(db, "celulas", d.id));
        }
    } catch (e) { console.error(e); alert("Erro ao limpar semana."); }
}

async function toggleSemana(sala, bloco) {
    const semanaId = `${TURNO}_${sala}_bloco${bloco}`;
    const docRef = doc(db, "semanas", semanaId);
    try {
        const docSnap = await getDoc(docRef);
        let liberada = true;
        if (docSnap.exists()) liberada = docSnap.data().liberada !== false;
        const novoEstado = !liberada;
        await setDoc(docRef, {
            liberada: novoEstado,
            atualizadoEm: new Date().toISOString(),
            atualizadoPor: EMAIL_ADMIN
        }, { merge: true });
        estadosSemanas[semanaId] = novoEstado;
        atualizarUISemana(sala, bloco, novoEstado);
        const snapshot = await getDocs(collection(db, "celulas"));
        const dados = {};
        snapshot.forEach(doc => { dados[doc.id] = doc.data(); });
        aplicarDados(dados);
    } catch (e) { console.error(e); alert("Erro ao alternar semana."); }
}

function atualizarUISemana(sala, bloco, liberada) {
    const btn = document.querySelector(`.btn-toggle-semana[data-sala="${sala}"][data-bloco="${bloco}"]`);
    if (!btn) return;
    if (liberada) {
        btn.textContent = '🔓 Liberada';
        btn.style.background = '#2e7d32';
    } else {
        btn.textContent = '🔒 Bloqueada';
        btn.style.background = '#c62828';
    }
}

function isSemanaLiberada(celulaId) {
    const match = celulaId.match(/^(manha|tarde)_([a-z-]+)_bloco(\d+)_/);
    if (!match) return true;
    const semanaId = `${match[1]}_${match[2]}_bloco${match[3]}`;
    if (estadosSemanas[semanaId] === undefined) return true;
    return estadosSemanas[semanaId] === true;
}

async function adicionarSemana(salaId) {
    const chave = `${TURNO}_${salaId}`;
    const totalAtual = totalSemanasPorSala[chave] || MAX_SEMANAS;

    if (totalAtual >= MAX_SEMANAS) {
        alert(`⚠️ Só é possível ${MAX_SEMANAS} semanas por tabela.\nApague uma semana antes de adicionar outra.`);
        return;
    }

    const novoTotal = totalAtual + 1;

    try {
        await setDoc(doc(db, "config", `${chave}_totalSemanas`), {
            total: novoTotal, atualizadoEm: new Date().toISOString()
        }, { merge: true });

        await setDoc(doc(db, "semanas", `${TURNO}_${salaId}_bloco${totalAtual}`), {
            liberada: true, atualizadoEm: new Date().toISOString(), atualizadoPor: EMAIL_ADMIN
        }, { merge: true });

        totalSemanasPorSala[chave] = novoTotal;
        const container = document.getElementById('tabelas');
        container.innerHTML = '';
        gerarTabelas();
        configurarEdicao();
        if (isAdmin) {
            document.querySelectorAll('.btn-limpar-tabela').forEach(b => b.style.display = 'inline-block');
            document.querySelectorAll('.btn-limpar-semana').forEach(b => b.style.display = 'inline-block');
            document.querySelectorAll('.btn-toggle-semana').forEach(b => b.style.display = 'inline-block');
            document.querySelectorAll('.btn-apagar-semana').forEach(b => b.style.display = 'inline-block');
            document.querySelectorAll('.btn-adicionar-semana').forEach(b => b.style.display = 'inline-block');
        }
        const snapshot = await getDocs(collection(db, "celulas"));
        const dados = {};
        snapshot.forEach(doc => { dados[doc.id] = doc.data(); });
        aplicarDados(dados);
    } catch (e) { console.error(e); alert("Erro ao adicionar semana."); }
}
async function apagarSemana(salaId, bloco, totalAtual) {
    if (totalAtual <= MIN_SEMANAS) {
        alert(`⚠️ É necessário manter ao menos ${MIN_SEMANAS} semana por tabela.`);
        return;
    }

    if (!confirm(`⚠️ Apagar a Semana ${bloco + 1} da tabela "${salaId}"?\n\nOs dados serão apagados e as semanas seguintes vão subir uma posição.`)) return;

    const chave = `${TURNO}_${salaId}`;

    try {
        const prefixoApagar = `${TURNO}_${salaId}_bloco${bloco}_`;
        const snapshot = await getDocs(collection(db, "celulas"));
        const docsApagar = snapshot.docs.filter(d => d.id.startsWith(prefixoApagar));
        for (const d of docsApagar) await deleteDoc(doc(db, "celulas", d.id));

        await deleteDoc(doc(db, "semanas", `${TURNO}_${salaId}_bloco${bloco}`));

        for (let i = bloco; i < totalAtual - 1; i++) {
            const origem = `${TURNO}_${salaId}_bloco${i + 1}_`;
            const destino = `${TURNO}_${salaId}_bloco${i}_`;
            const docsMover = snapshot.docs.filter(d => d.id.startsWith(origem));
            for (const d of docsMover) {
                const novoId = d.id.replace(origem, destino);
                const dados = d.data();
                dados.bloco = i;
                await setDoc(doc(db, "celulas", novoId), dados);
                await deleteDoc(doc(db, "celulas", d.id));
            }
            
            const estadoAntigo = await getDoc(doc(db, "semanas", `${TURNO}_${salaId}_bloco${i + 1}`));
            if (estadoAntigo.exists()) {
                await setDoc(doc(db, "semanas", `${TURNO}_${salaId}_bloco${i}`), estadoAntigo.data());
                await deleteDoc(doc(db, "semanas", `${TURNO}_${salaId}_bloco${i + 1}`));
            }
        }

        const novoTotal = totalAtual - 1;
        await setDoc(doc(db, "config", `${chave}_totalSemanas`), {
            total: novoTotal, atualizadoEm: new Date().toISOString()
        }, { merge: true });

        totalSemanasPorSala[chave] = novoTotal;

        const container = document.getElementById('tabelas');
        container.innerHTML = '';
        gerarTabelas();
        configurarEdicao();
        
        if (isAdmin) {
            document.querySelectorAll('.btn-limpar-tabela').forEach(b => b.style.display = 'inline-block');
            document.querySelectorAll('.btn-limpar-semana').forEach(b => b.style.display = 'inline-block');
            document.querySelectorAll('.btn-toggle-semana').forEach(b => b.style.display = 'inline-block');
            document.querySelectorAll('.btn-apagar-semana').forEach(b => b.style.display = 'inline-block');
            document.querySelectorAll('.btn-adicionar-semana').forEach(b => b.style.display = 'inline-block');
        }
        
        const snapAtualizado = await getDocs(collection(db, "celulas"));
        const dados = {};
        snapAtualizado.forEach(doc => { dados[doc.id] = doc.data(); });
        aplicarDados(dados);

    } catch (e) {
        console.error(e);
        alert("Erro ao apagar semana.");
    }
}

iniciar();