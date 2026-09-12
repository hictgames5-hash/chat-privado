const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

let clientes = [];

wss.on('connection', (ws) => {
  if (clientes.length >= 2) {
    ws.send(JSON.stringify({ tipo: 'sistema', texto: 'A sala está cheia! (Máximo de 2 usuários)' }));
    ws.close();
    return;
  }

  clientes.push(ws);
  console.log(`Novo usuário conectado. Total: ${clientes.length}/2`);

  ws.send(JSON.stringify({ tipo: 'sistema', texto: 'Você entrou no chat privado.' }));
  
  if (clientes.length === 2) {
    clientes.forEach(cliente => {
      cliente.send(JSON.stringify({ tipo: 'sistema', texto: 'O outro usuário entrou! Vocês já podem conversar.' }));
    });
  }

  // Ouve eventos enviados pelos clientes (enviar, editar ou excluir)
  ws.on('message', (dados) => {
    // Repassa as ações diretamente para o outro participante
    clientes.forEach((cliente) => {
      if (cliente !== ws && cliente.readyState === 1) {
        cliente.send(dados.toString());
      }
    });
  });

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