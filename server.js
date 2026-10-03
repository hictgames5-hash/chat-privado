const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

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
            hostWs: ws,
            senha: '',
            limite: 10
          };
        }

        const sala = salas[salaAtual];

        if (sala.clientes.length >= sala.limite) {
          ws.send(JSON.stringify({ tipo: 'sistema', texto: 'A sala está cheia!' }));
          return;
        }

        const clienteInfo = { ws, apelido, autenticado: sala.senha === '' };
        sala.clientes.push(ws);
        ws.clienteRef = clienteInfo;

        if (sala.senha !== '' && ws !== sala.hostWs) {
          ws.send(JSON.stringify({ tipo: 'pedir_senha' }));
        } else {
          clienteInfo.autenticado = true;
          ws.send(JSON.stringify({ tipo: 'acesso_liberado' }));
        }

        ws.send(JSON.stringify({ tipo: 'status_host', ehHost: ws === sala.hostWs }));
        atualizarVagas(salaAtual);
        return;
      }

      if (!salaAtual || !salas[salaAtual]) return;
      const sala = salas[salaAtual];
      const meuRef = ws.clienteRef;

      if (dados.tipo === 'atualizar_apelido') {
        if (meuRef) meuRef.apelido = dados.apelido;
        return;
      }

      if (!meuRef || !meuRef.autenticado) {
        if (dados.tipo === 'verificar_senha') {
          if (dados.senha === sala.senha) {
            meuRef.autenticado = true;
            ws.send(JSON.stringify({ tipo: 'acesso_liberado' }));
            ws.send(JSON.stringify({ tipo: 'sistema', texto: 'Senha correta! Bem-vindo.' }));
            atualizarVagas(salaAtual);
          } else {
            ws.send(JSON.stringify({ tipo: 'senha_rejeitada' }));
          }
        }
        return;
      }

      // Configurações exclusivas do Host
      if (ws === sala.hostWs) {
        if (dados.tipo === 'config_senha') {
          sala.senha = dados.senha.trim();
          const aviso = sala.senha ? 'O anfitrião definiu uma senha para a sala.' : 'O anfitrião removeu a senha da sala.';
          transmitirSistema(salaAtual, aviso);
          return;
        }
        if (dados.tipo === 'config_limite') {
          sala.limite = parseInt(dados.limite) || 10;
          transmitirSistema(salaAtual, `Limite da sala alterado para ${sala.limite} pessoas.`);
          atualizarVagas(salaAtual);
          return;
        }
      }

      // Envio de mensagens e status de digitação
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

      if (ws === sala.hostWs && sala.clientes.length > 0) {
        sala.hostWs = sala.clientes[0];
        sala.hostWs.send(JSON.stringify({ tipo: 'status_host', ehHost: true }));
        sala.hostWs.send(JSON.stringify({ tipo: 'sistema', texto: 'Você é o novo anfitrião da sala.' }));
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
