import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc,
         deleteDoc, onSnapshot, writeBatch }
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

// 🆕 Limite de reservas do usuário logado (null = sem limite / admin)
// Lido junto do getDoc(allowlist) no login — 0 leituras extras.
let limiteReservas = null;

// 🆕 CACHE LOCAL — guarda o último estado recebido pelo onSnapshot de células.
let dadosCelulas = {};

// 🆕 Helper — retorna os IDs de dadosCelulas que começam com um prefixo.
function idsComPrefixo(prefixo) {
    return Object.keys(dadosCelulas).filter(id => id.startsWith(prefixo));
}

function atualizarStatus(texto, tipo) {
    const el = document.getElementById('status');
    el.textContent = texto;
    el.className = 'status ' + tipo;
}

// ============================================================
// 🆕 CONTROLE DE LIMITE DE RESERVAS
// Regra: limite por (turno + bloco/semana), independente entre turnos.
// Contagem 100% em memória (dadosCelulas) — 0 leituras.
// ============================================================

// Conta reservas do usuário atual agrupadas por bloco (semana).
// Filtra: só células do turno atual, ignora datas, só do próprio usuário.
function contarReservasPorBloco() {
    const contagem = {}; // { 0: 3, 1: 5, ... }
    if (!usuarioAtual) return contagem;

    const prefixoTurno = `${TURNO}_`;
    for (const id in dadosCelulas) {
        if (!id.startsWith(prefixoTurno)) continue;
        if (id.includes('_data_dia')) continue;         // ignora células de data
        const d = dadosCelulas[id];
        if (!d || d.dono !== usuarioAtual) continue;    // só do próprio usuário
        const m = id.match(/_bloco(\d+)_/);
        if (!m) continue;
        const bloco = parseInt(m[1]);
        contagem[bloco] = (contagem[bloco] || 0) + 1;
    }
    return contagem;
}

// Verifica se o usuário pode criar uma nova reserva no bloco informado.
function podeCriarReservaNoBloco(bloco) {
    if (isAdmin) return true;
    if (limiteReservas === null) return true;           // sem limite
    const contagem = contarReservasPorBloco();
    return (contagem[bloco] || 0) < limiteReservas;
}

// Monta o texto de status com o uso por semana (apenas professor com limite).
// Usa o maior total real entre as 3 salas do turno (já em memória) —
// evita mostrar "Sem 3" / "Sem 4" quando a sala só tem 1 ou 2 semanas.
function textoStatusComLimite() {
    if (isAdmin || limiteReservas === null) return null;
    const contagem = contarReservasPorBloco();

    // Descobre o maior total configurado entre as salas deste turno.
    // totalSemanasPorSala já está em memória (carregado no login) — 0 leituras.
    let maxBlocos = 0;
    SALAS.forEach(s => {
        const chave = `${TURNO}_${s.id}`;
        const t = totalSemanasPorSala[chave] || MAX_SEMANAS;
        if (t > maxBlocos) maxBlocos = t;
    });

    const partes = [];
    for (let b = 0; b < maxBlocos; b++) {
        const usadas = contagem[b] || 0;
        partes.push(`Sem ${b + 1}: ${usadas}/${limiteReservas}`);
    }
    return `✅ Conectado — ${partes.join(' • ')}`;
}

// Atualiza o status do professor (chamado após login e a cada onSnapshot).
function atualizarStatusLimite() {
    if (isAdmin) return;
    const txt = textoStatusComLimite();
    if (txt) atualizarStatus(txt, 'online');
}

// ============================================================
// 🆕 BANNER INFORMATIVO DO PROFESSOR (rodapé fixo)
// Mostra o limite real do professor logado — 100% em memória.
// ============================================================
function atualizarAvisoProfessor() {
    const banner = document.getElementById('aviso-professor');
    const texto  = document.getElementById('aviso-professor-texto');
    if (!banner || !texto) return;

    // Admin não vê o banner
    if (isAdmin || !usuarioAtual) {
        banner.style.display = 'none';
        document.body.classList.remove('tem-aviso-professor');
        return;
    }

    // Monta o texto com o limite real
    let fraseLimite;
    if (limiteReservas === null) {
        fraseLimite = 'você tem <strong>reservas ilimitadas</strong> neste turno';
    } else {
        fraseLimite = `você tem <strong>${limiteReservas} ${limiteReservas === 1 ? 'reserva' : 'reservas'} por semana</strong> (por turno)`;
    }

    texto.innerHTML =
        'ℹ️ <strong>Como reservar:</strong> ' + fraseLimite +
        '. Clique em uma célula vazia (amarela) de uma semana liberada e digite o ' +
        '<strong>nome e a turma</strong> — ex.: <em>Rielle 2A</em>. ' +
        'Para mais reservas, fale com a <strong>informática</strong>.';

    banner.style.display = 'block';
    document.body.classList.add('tem-aviso-professor');
}

// Esconde o banner (usado na tela de login e no logout)
function esconderAvisoProfessor() {
    const banner = document.getElementById('aviso-professor');
    if (banner) banner.style.display = 'none';
    document.body.classList.remove('tem-aviso-professor');
}

// ============================================================

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

        const coresPorSala = {
            'sala-informatica': '#1565c0',
            'multiuso':         '#2e7d32',
            'itinerante':       '#6a1b9a'
        };
        const corBotao = coresPorSala[sala.id] || '#2e7d32';

        btnAdd.style.cssText = `display:none; margin-top:15px; padding:10px 20px; background:${corBotao}; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size:13px; width:100%;`;
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

    // 🆕 Detecção de CRIAÇÃO (célula estava vazia no cache e agora tem conteúdo)
    // Usa o cache em memória — 0 leituras.
    const jaExistia = !!dadosCelulas[id];
    const ehCriacao = !jaExistia && conteudo !== '';

    // 🆕 Bloqueia criação se o limite semanal do bloco foi atingido
    if (ehCriacao && !podeCriarReservaNoBloco(bloco)) {
        const usadas = (contarReservasPorBloco()[bloco] || 0);
        alert(
            `⚠️ Limite atingido na Semana ${bloco + 1}.\n\n` +
            `Você já tem ${usadas} de ${limiteReservas} reserva(s) nesta semana neste turno.\n` +
            `Apague uma reserva sua nesta semana ou fale com o administrador.`
        );
        celula.textContent = conteudoOriginal;   // reverte
        return;
    }

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
let unsubscribeLimite = null;

function ouvirMudancas() {
    // Snapshot de células — mantém dadosCelulas sempre atualizado em tempo real.
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    unsubscribeSnapshot = onSnapshot(
    collection(db, "celulas"),
    (snapshot) => {
        dadosCelulas = {};
        snapshot.forEach(doc => { dadosCelulas[doc.id] = doc.data(); });
        aplicarDados(dadosCelulas);
        // 🆕 Atualiza contador de limite no status (0 leituras — só memória)
        atualizarStatusLimite();
    },
    (erro) => {
        console.error("Listener de células caiu:", erro);
        atualizarStatus("⚠️ Conexão em tempo real perdida — recarregue a página", "offline");
    }
);

    // Snapshot de semanas — atualiza UI de bloqueio/liberação.
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

        aplicarDados(dadosCelulas);
        // 🆕 Recalcula status de limite (0 leituras)
        atualizarStatusLimite();
    });
}

// 🆕 Listener do limite do próprio professor (tempo real).
// Se o admin mudar o limite em outra aba, o banner atualiza sozinho.
// +1 listener — 0 leituras por ação.
function ouvirLimiteUsuario(email) {
    if (unsubscribeLimite) unsubscribeLimite();
    unsubscribeLimite = onSnapshot(doc(db, "allowlist", email), (snap) => {
        if (!snap.exists()) return;
        const dados = snap.data() || {};
        limiteReservas = (typeof dados.limiteReservas === 'number' && dados.limiteReservas > 0)
            ? dados.limiteReservas
            : null;
        atualizarAvisoProfessor();
        atualizarStatusLimite();
    });
}

window.loginGoogle = async function() {
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); }
    catch (e) { alert("Erro ao fazer login: " + e.message); }
};

window.logoutAdmin = async function() {
    try {
        if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
        if (unsubscribeSemanas)   { unsubscribeSemanas();   unsubscribeSemanas = null; }
        if (unsubscribeLimite)    { unsubscribeLimite();    unsubscribeLimite = null; }
        await signOut(auth);
        usuarioAtual = null;
        isAdmin = false;
        limiteReservas = null;
        dadosCelulas = {};
        estadosSemanas = {};
        totalSemanasPorSala = {};
        esconderAvisoProfessor();
        document.getElementById('tabelas').innerHTML = '';
        document.getElementById('btnLogin').style.display = 'none';
        document.getElementById('btnLogout').style.display = 'none';
        mostrarTelaLogin();
        atualizarStatus("🔐 Conecte-se com sua conta Google", "offline");
    } catch (e) {
        alert("Erro ao sair: " + e.message);
    }
};

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

            // 🆕 Lê o limite do MESMO doc da allowlist (já lido acima — 0 leituras extras)
            const dadosAllow = docSnap.data() || {};
            limiteReservas = (typeof dadosAllow.limiteReservas === 'number' && dadosAllow.limiteReservas > 0)
                ? dadosAllow.limiteReservas
                : null;

            document.getElementById('btnLogin').style.display = 'none';
            document.getElementById('btnLogout').style.display = 'inline-block';

            if (isAdmin) {
                atualizarStatus("👑 ADMIN — você pode editar qualquer célula", "admin");
            } else {
                atualizarStatus("✅ Conectado — você pode adicionar em células vazias e editar as que criou", "online");
            }

            // 🆕 Mostra banner informativo no rodapé (professor apenas)
            atualizarAvisoProfessor();

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

            // Carga inicial única — depois disso, quem mantém os dados atualizados
            // é o onSnapshot de ouvirMudancas().
            const snapshot = await getDocs(collection(db, "celulas"));
            dadosCelulas = {};
            snapshot.forEach(doc => { dadosCelulas[doc.id] = doc.data(); });
            aplicarDados(dadosCelulas);

            ouvirMudancas();

            // 🆕 Listener do limite em tempo real (só para professor)
            if (!isAdmin) ouvirLimiteUsuario(user.email);

            // 🆕 Mostra contador de limite no status (professor com limite)
            atualizarStatusLimite();

            // 🆕 Reforça o banner (caso o total de semanas tenha mudado)
            atualizarAvisoProfessor();

        } else {
            console.warn("E-mail não autorizado:", user.email);
            atualizarStatus("❌ Seu e-mail não está autorizado. Escolha outra conta.", "offline");
            esconderAvisoProfessor();
            await signOut(auth);
            mostrarTelaLogin();
        }
    } catch (erro) {
        console.error("Erro ao verificar acesso:", erro);
        atualizarStatus("❌ Erro ao verificar acesso. Escolha uma conta.", "offline");
        esconderAvisoProfessor();
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
    esconderAvisoProfessor();   // 🆕 garante que o banner suma na tela de login
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
            const dados = doc.data() || {};
            const ehAdmin = (email === EMAIL_ADMIN);
            const limite = dados.limiteReservas ?? 0;
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee; gap:8px; flex-wrap:wrap;">
                    <span style="flex:1; min-width:140px; overflow:hidden; text-overflow:ellipsis;">${email} ${ehAdmin ? '👑' : ''}</span>
                    ${!ehAdmin ? `
                        <label style="font-size:12px; color:#555; white-space:nowrap;">Limite:</label>
                        <input type="number" min="0" value="${limite}"
                               onchange="salvarLimite('${email}', this.value)"
                               style="width:70px; padding:4px 6px; border:1px solid #ccc; border-radius:3px; font-size:12px;"
                               title="0 = sem limite">
                        <button onclick="removerEmail('${email}')" style="padding:4px 10px; background:#c62828; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px;">Remover</button>
                    ` : `<span style="font-size:12px; color:#999;">sem limite</span>`}
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red;">Erro ao carregar lista.</p>';
    }
}

// 🆕 Salva o limite de reservas de um e-mail (apenas admin). 0 = sem limite.
window.salvarLimite = async function(email, valor) {
    if (!isAdmin) return;
    const n = parseInt(valor, 10);
    if (isNaN(n) || n < 0) { alert('Valor inválido.'); return; }
    try {
        // merge: true preserva email/addedAt/addedBy
        await setDoc(doc(db, "allowlist", email), {
            limiteReservas: n === 0 ? null : n
        }, { merge: true });
        // feedback visual rápido
        const el = document.getElementById('lista-emails');
        if (el) el.style.boxShadow = '0 0 0 2px #2e7d32';
        setTimeout(() => { if (el) el.style.boxShadow = ''; }, 600);
    } catch (e) {
        console.error(e);
        alert('Erro ao salvar limite.');
    }
};

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
    const ids = idsComPrefixo(prefixo);
    if (ids.length === 0) return;

    const CHUNK = 400;
    try {
        for (let i = 0; i < ids.length; i += CHUNK) {
            const batch = writeBatch(db);
            ids.slice(i, i + CHUNK).forEach(id =>
                batch.delete(doc(db, "celulas", id))
            );
            await batch.commit();
        }
        // ✅ 0 leituras — o onSnapshot(celulas) reflete sozinho
    } catch (e) {
        console.error(e);
        alert("Erro ao limpar tabela. Tente novamente.");
        aplicarDados(dadosCelulas);
    }
}

async function limparSemana(salaId, bloco) {
    if (!confirm(`⚠️ Limpar a Semana ${bloco + 1} da tabela "${salaId}"?`)) return;

    const prefixo = `${TURNO}_${salaId}_bloco${bloco}_`;
    const ids = idsComPrefixo(prefixo);
    if (ids.length === 0) return;

    const CHUNK = 400;
    try {
        for (let i = 0; i < ids.length; i += CHUNK) {
            const batch = writeBatch(db);
            ids.slice(i, i + CHUNK).forEach(id =>
                batch.delete(doc(db, "celulas", id))
            );
            await batch.commit();
        }
    } catch (e) {
        console.error(e);
        alert("Erro ao limpar semana. Tente novamente.");
        aplicarDados(dadosCelulas);
    }
}

async function toggleSemana(sala, bloco) {
    const semanaId = `${TURNO}_${sala}_bloco${bloco}`;
    const docRef = doc(db, "semanas", semanaId);

    const liberadaAtual = estadosSemanas[semanaId] !== false;
    const novoEstado = !liberadaAtual;

    try {
        await setDoc(docRef, {
            liberada: novoEstado,
            atualizadoEm: new Date().toISOString(),
            atualizadoPor: EMAIL_ADMIN
        }, { merge: true });

        estadosSemanas[semanaId] = novoEstado;
        atualizarUISemana(sala, bloco, novoEstado);
        aplicarDados(dadosCelulas);
    } catch (e) {
        console.error(e);
        alert("Erro ao alternar semana.");
    }
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
        aplicarDados(dadosCelulas);
        // 🆕 Reforça o banner (mudou o total de semanas)
        atualizarAvisoProfessor();
    } catch (e) { console.error(e); alert("Erro ao adicionar semana."); }
}

let apagandoSemana = false;

async function apagarSemana(salaId, bloco, totalAtual) {
    if (apagandoSemana) {
        alert('⚠️ Já existe uma operação de apagar semana em andamento. Aguarde terminar.');
        return;
    }
    if (totalAtual <= MIN_SEMANAS) {
        alert(`⚠️ É necessário manter ao menos ${MIN_SEMANAS} semana por tabela.`);
        return;
    }
    if (!confirm(
        `⚠️ Apagar a Semana ${bloco + 1} da tabela "${salaId}"?\n\n` +
        `Os dados serão apagados e as semanas seguintes vão subir uma posição.`
    )) return;

    apagandoSemana = true;
    const chave = `${TURNO}_${salaId}`;

    // Snapshot congelado para não sofrer corrida com o onSnapshot
    const celulasCongeladas = { ...dadosCelulas };
    const semanasCongeladas = { ...estadosSemanas };
    const totalCongelado = totalAtual;

    try {
        const CHUNK = 400;

        // Helper local — usa o snapshot congelado, não dadosCelulas global
        const idsComPrefixoCongelado = (prefixo) =>
            Object.keys(celulasCongeladas).filter(id => id.startsWith(prefixo));

        // ---------- 1) Calcular operações em memória ----------
        const operacoesSet = [];
        const operacoesDel = [];

        // 1a) Bloco alvo: será apagado
        idsComPrefixoCongelado(`${TURNO}_${salaId}_bloco${bloco}_`)
            .forEach(id => operacoesDel.push(id));

        // 1b) Blocos seguintes: SET novo ID + DEL ID antigo
        for (let i = bloco + 1; i < totalCongelado; i++) {
            const prefixoOrigem  = `${TURNO}_${salaId}_bloco${i}_`;
            const prefixoDestino = `${TURNO}_${salaId}_bloco${i - 1}_`;
            idsComPrefixoCongelado(prefixoOrigem).forEach(idAntigo => {
                const idNovo = idAntigo.replace(prefixoOrigem, prefixoDestino);
                const dadosNovos = { ...celulasCongeladas[idAntigo], bloco: i - 1 };
                operacoesSet.push({ id: idNovo, dados: dadosNovos });
                operacoesDel.push(idAntigo);
            });
        }

        // ---------- 2) SETs primeiro (blindagem) ----------
        for (let i = 0; i < operacoesSet.length; i += CHUNK) {
            const batch = writeBatch(db);
            operacoesSet.slice(i, i + CHUNK).forEach(op =>
                batch.set(doc(db, "celulas", op.id), op.dados)
            );
            await batch.commit();
        }

        // ---------- 3) DELs depois (só roda se os SETs deram certo) ----------
        for (let i = 0; i < operacoesDel.length; i += CHUNK) {
            const batch = writeBatch(db);
            operacoesDel.slice(i, i + CHUNK).forEach(id =>
                batch.delete(doc(db, "celulas", id))
            );
            await batch.commit();
        }

        // ---------- 4) Mover estados das semanas ----------
        // ⚠️ NÃO adicione um delete extra no final — o loop já cobre todos os blocos.
        const bSemanas = writeBatch(db);
        for (let i = bloco + 1; i < totalCongelado; i++) {
            const origem  = `${TURNO}_${salaId}_bloco${i}`;
            const destino = `${TURNO}_${salaId}_bloco${i - 1}`;
            const liberada = semanasCongeladas[origem] !== false;
            bSemanas.set(
                doc(db, "semanas", destino),
                { liberada, atualizadoEm: new Date().toISOString(), atualizadoPor: EMAIL_ADMIN },
                { merge: true }
            );
            bSemanas.delete(doc(db, "semanas", origem));
        }
        await bSemanas.commit();

        // ---------- 5) Atualizar config ----------
        const novoTotal = totalCongelado - 1;
        await setDoc(doc(db, "config", `${chave}_totalSemanas`), {
            total: novoTotal,
            atualizadoEm: new Date().toISOString()
        }, { merge: true });

        totalSemanasPorSala[chave] = novoTotal;

        // ---------- 6) Re-render ----------
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

        aplicarDados(dadosCelulas);
        atualizarAvisoProfessor();

    } catch (e) {
        console.error("Erro crítico ao apagar semana:", e);
        alert("🚨 ERRO AO APAGAR: cota ou conexão. A operação foi interrompida. Recarregue a página em alguns minutos.");
        aplicarDados(dadosCelulas);
    } finally {
        apagandoSemana = false;
    }
}

iniciar();