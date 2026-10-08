import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot }
    from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut }
    from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ===== DETECTA O TURNO PELO ATRIBUTO DO BODY =====
const TURNO = document.body.dataset.turno;   // 'manha' ou 'tarde'

// Configurações que mudam por turno
const CONFIG_POR_TURNO = {
    manha: {
        sufixo: 'Manhã',
        aulas: [1, 2, 3, 4, 5, 6]    // 6 aulas na manhã
    },
    tarde: {
        sufixo: 'Tarde',
        aulas: [1, 2, 3, 4, 5]       // 5 aulas na tarde
    }
};

const config = CONFIG_POR_TURNO[TURNO];

// ===== FIREBASE =====
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

// ===== CONSTANTES =====
const SALAS = [
    { id: 'sala-informatica', nome: `Sala de Informática - ${config.sufixo}` },
    { id: 'multiuso',         nome: `Multiuso - ${config.sufixo}` },
    { id: 'itinerante',       nome: `Itinerante - ${config.sufixo}` }
];
const DIAS = ['Segunda-Feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
const DATAS = ['28/09', '29/09', '30/09', '01/10', '02/10'];
const BLOCOS = 4;
const AULAS = config.aulas;

let usuarioAtual = null;
let isAdmin = false;

// ===== STATUS =====
function atualizarStatus(texto, tipo) {
    const el = document.getElementById('status');
    el.textContent = texto;
    el.className = 'status ' + tipo;
}

// ===== GERAR TABELAS =====
function gerarTabelas() {
    const container = document.getElementById('tabelas');
    container.innerHTML = '';

    SALAS.forEach(sala => {
        const div = document.createElement('div');
        div.className = 'tabela-container';

        const h2 = document.createElement('h2');
        h2.textContent = sala.nome;
        div.appendChild(h2);

        const table = document.createElement('table');
        table.className = sala.id;
        const tbody = document.createElement('tbody');

        for (let b = 0; b < BLOCOS; b++) {
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

            if (b < BLOCOS - 1) {
                const trSep = document.createElement('tr');
                trSep.className = 'linha-separadora';
                trSep.innerHTML = `<td colspan="6"></td>`;
                tbody.appendChild(trSep);
            }
        }

        table.appendChild(tbody);
        div.appendChild(table);
        container.appendChild(div);
    });
}

// ===== APLICAR DADOS =====
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
            } else if (ehDono) {
                celula.contentEditable = 'true';
                celula.title = 'Você criou — pode editar';
            } else {
                celula.contentEditable = 'false';
                if (!ehData) celula.classList.add('bloqueada');
                celula.title = 'Preenchido por outra pessoa';
            }
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
            celula.contentEditable = 'true';
            celula.title = '';
        }
    });
}

// ===== SALVAR =====
async function salvarCelula(celula) {
    const id = celula.dataset.id;
    const conteudo = celula.textContent.trim();
    const dono = usuarioAtual;
    const conteudoOriginal = celula.dataset.valorOriginal || '';

    if (!dono) return;

    try {
        const docRef = doc(db, "celulas", id);
        if (conteudo === '') {
            await deleteDoc(docRef);
        } else {
            try {
                await updateDoc(docRef, { conteudo });
            } catch (e) {
                await setDoc(docRef, { conteudo, dono });
            }
        }
    } catch (erro) {
        console.error("Erro ao salvar (sem permissão):", erro);
        celula.textContent = conteudoOriginal;
    }
}

// ===== EVENTOS =====
function configurarEdicao() {
    document.querySelectorAll('td[data-id], .data-dia[data-id]').forEach(celula => {
        celula.addEventListener('focus', () => {
            celula.dataset.valorOriginal = celula.textContent;
        });
        celula.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); celula.blur(); }
        });
        celula.addEventListener('blur', () => { salvarCelula(celula); });
    });
}

function ouvirMudancas() {
    onSnapshot(collection(db, "celulas"), (snapshot) => {
        const dados = {};
        snapshot.forEach(doc => { dados[doc.id] = doc.data(); });
        aplicarDados(dados);
    });
}

// ===== LOGIN / LOGOUT =====
window.loginGoogle = async function() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (e) {
        alert("Erro ao fazer login: " + e.message);
    }
};

window.logoutAdmin = async function() {
    try {
        await signOut(auth);
        await signInAnonymously(auth);
    } catch (e) {
        alert("Erro ao sair: " + e.message);
    }
};

// ===== MODO VISUALIZAÇÃO =====
window.entrarVisualizacao = function() {
    document.body.classList.add('modo-visualizacao');

    document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        el.dataset.editavelOriginal = 'true';
        el.contentEditable = 'false';
    });

    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => {
            console.warn('Não foi possível entrar em tela cheia:', err);
        });
    }
};

window.sairVisualizacao = function() {
    document.body.classList.remove('modo-visualizacao');

    document.querySelectorAll('[data-editavel-original="true"]').forEach(el => {
        el.contentEditable = 'true';
        delete el.dataset.editavelOriginal;
    });

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
            console.warn('Erro ao sair da tela cheia:', err);
        });
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

// ===== INICIALIZAÇÃO =====
async function iniciar() {
    atualizarStatus("🔐 Autenticando...", "offline");

    try { await signInAnonymously(auth); }
    catch (erro) { atualizarStatus("❌ Erro na autenticação", "offline"); return; }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            usuarioAtual = null;
            atualizarStatus("❌ Não autenticado", "offline");
            return;
        }

        usuarioAtual = user.uid;
        isAdmin = (user.email === EMAIL_ADMIN);

        document.getElementById('btnLogin').style.display = isAdmin ? 'none' : 'inline-block';
        document.getElementById('btnLogout').style.display = isAdmin ? 'inline-block' : 'none';

        if (isAdmin) {
            atualizarStatus("👑 ADMIN — você pode editar qualquer célula", "admin");
        } else {
            atualizarStatus("✅ Conectado — você pode adicionar em células vazias e editar as que criou", "online");
        }

        const container = document.getElementById('tabelas');
        if (container.children.length === 0) {
            gerarTabelas();
            configurarEdicao();
        }

        const snapshot = await getDocs(collection(db, "celulas"));
        const dados = {};
        snapshot.forEach(doc => { dados[doc.id] = doc.data(); });
        aplicarDados(dados);

        ouvirMudancas();
    });
}

iniciar();