const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

/*
  Estrutura de salas:
  salas[nome] = {
    clientes: [ { ws, apelido, autenticado } ],
    hostWs: ws,
    senha: '',
    limite: 10
  }
*/
let salas = {};

wss.on('connection', (ws) => {
  let salaAtual = null;

  ws.on('message', (mensagemBruta) => {
    try {
      const dados = JSON.parse(mensagemBruta.toString());

      if (dados.tipo === 'entrar_sala') {
        salaAtual = dados.sala || 'geral';
        const apelido = dados.apelido || 'Anônimo';

        if (!salas[salaAtual]) {
          salas[salaAtual] = {
            clientes: [],
            hostWs: ws, // O primeiro a criar vira host
            senha: '',
            limite: 10
          };
        }

        const sala = salas[salaAtual];

        // Verificar limite de vagas
        if (sala.clientes.length >= sala.limite) {
          ws.send(JSON.stringify({ tipo: 'sistema', texto: 'A sala está cheia!' }));
          return;
        }

        const clienteInfo = { ws, apelido, autenticado: sala.senha === '' };
        sala.clientes.push(ws);

        ws.clienteRef = clienteInfo;

        // Se tem senha configurada e não é o host, pede senha
        if (sala.senha !== '' && ws !== sala.hostWs) {
          ws.send(JSON.stringify({ tipo: 'pedir_senha' }));
        } else {
          clienteInfo.autenticado = true;
          ws.send(JSON.stringify({ tipo: 'acesso_liberado' }));
        }

        // Informar se é host
        ws.send(JSON.stringify({ tipo: 'status_host', ehHost: ws === sala.hostWs }));
        atualizarVagas(salaAtual);
        return;
      }

      if (!salaAtual || !salas[salaAtual]) return;
      const sala = salas[salaAtual];
      const meuRef = ws.clienteRef;

      if (!meuRef || !meuRef.autenticado) return; // Bloqueia se não autenticado

      // Verificação de senha enviada
      if (dados.tipo === 'verificar_senha') {
        if (dados.senha === sala.senha) {
          meuRef.autenticado = true;
          ws.send(JSON.stringify({ tipo: 'acesso_liberado' }));
          ws.send(JSON.stringify({ tipo: 'sistema', texto: 'Senha correta! Bem-vindo.' }));
        } else {
          ws.send(JSON.stringify({ tipo: 'senha_rejeitada' }));
        }
        return;
      }

      // Ações exclusivas do Host
      if (ws === sala.hostWs) {
        if (dados.tipo === 'config_senha') {
          sala.senha = dados.senha.trim();
          const aviso = sala.senha ? 'O anfitrião protegeu a sala com senha.' : 'O anfitrião removeu a senha da sala.';
          transmitirSistema(salaAtual, aviso);
          return;
        }
        if (dados.tipo === 'config_limite') {
          sala.limite = parseInt(dados.limite) || 10;
          transmitirSistema(salaAtual, `O limite da sala foi alterado para ${sala.limite} pessoas.`);
          atualizarVagas(salaAtual);
          return;
        }
      }

      // Repasse de mensagens normais e digitando apenas para autenticados
      if (dados.tipo === 'nova_msg') {
        sala.clientes.forEach((cliente) => {
          if (cliente !== ws && cliente.clienteRef && cliente.clienteRef.autenticado && cliente.readyState === 1) {
            cliente.send(JSON.stringify({
              tipo: 'nova_msg',
              id: dados.id,
              autor: meuRef.apelido,
              texto: dados.texto,
              horario: dados.horario
            }));
          }
        });
      }
      else if (dados.tipo === 'digitando') {
        sala.clientes.forEach((cliente) => {
          if (cliente !== ws && cliente.clienteRef && cliente.clienteRef.autenticado && cliente.readyState === 1) {
            cliente.send(JSON.stringify({
              tipo: 'digitando',
              estado: dados.estado,
              autor: meuRef.apelido
            }));
          }
        });
      }

    } catch (e) {
      console.log('Erro:', e);
    }
  });

  ws.on('close', () => {
    if (salaAtual && salas[salaAtual]) {
      const sala = salas[salaAtual];
      sala.clientes = sala.clientes.filter(c => c !== ws);

      // Se o host saiu, passa a liderança para o próximo da lista
      if (ws === sala.hostWs && sala.clientes.length > 0) {
        sala.hostWs = sala.clientes[0];
        sala.hostWs.send(JSON.stringify({ tipo: 'status_host', ehHost: true }));
        sala.hostWs.send(JSON.stringify({ tipo: 'sistema', texto: 'Você agora é o anfitrião desta sala.' }));
      }

      atualizarVagas(salaAtual);

      if (sala.clientes.length === 0) {
        delete salas[salaAtual];
      }
    }
  });
});

function atualizarVagas(nomeSala) {
  const sala = salas[nomeSala];
  if (!sala) return;
  const autenticados = sala.clientes.filter(c => c.clienteRef && c.clienteRef.autenticado).length;
  sala.clientes.forEach(cliente => {
    if (cliente.readyState === 1) {
      cliente.send(JSON.stringify({
        tipo: 'atualizar_vagas',
        atual: autenticados,
        limite: sala.limite
      }));
    }
  });
}

function transmitirSistema(nomeSala, texto) {
  const sala = salas[nomeSala];
  if (!sala) return;
  sala.clientes.forEach(cliente => {
    if (cliente.readyState === 1) {
      cliente.send(JSON.stringify({ tipo: 'sistema', texto: texto }));
    }
  });
}

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => {
  console.log(`Servidor rodando na porta ${PORTA}`);
});