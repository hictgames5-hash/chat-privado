const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve o arquivo index.html na raiz do site
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Armazena as conexões ativas (máximo 2)
let clientes = [];

wss.on('connection', (ws) => {
  // Limita o acesso a no máximo 2 pessoas
  if (clientes.length >= 2) {
    ws.send(JSON.stringify({ tipo: 'sistema', texto: 'A sala está cheia! (Máximo de 2 usuários)' }));
    ws.close();
    return;
  }

  clientes.push(ws);
  console.log(`Novo usuário conectado. Total: ${clientes.length}/2`);

  // Avisa os usuários sobre a entrada do parceiro
  ws.send(JSON.stringify({ tipo: 'sistema', texto: 'Você entrou no chat privado.' }));
  
  if (clientes.length === 2) {
    clientes.forEach(cliente => {
      cliente.send(JSON.stringify({ tipo: 'sistema', texto: 'O outro usuário entrou! Vocês já podem conversar.' }));
    });
  }

  // Ouve as mensagens enviadas por um usuário
  ws.on('message', (dados) => {
    // Repassa a mensagem recebida para o outro usuário
    clientes.forEach((cliente) => {
      if (cliente !== ws && cliente.readyState === 1) {
        cliente.send(dados.toString());
      }
    });
  });

  // Trata a desconexão
  ws.on('close', () => {
    clientes = clientes.filter(cliente => cliente !== ws);
    console.log(`Usuário desconectado. Total: ${clientes.length}/2`);
    
    clientes.forEach(cliente => {
      cliente.send(JSON.stringify({ tipo: 'sistema', texto: 'O outro usuário se desconectou.' }));
    });
  });
});

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => {
  console.log(`Servidor rodando na porta ${PORTA}`);
});