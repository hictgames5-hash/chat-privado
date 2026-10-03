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

  // Ouve eventos enviados pelos clientes
  ws.on('message', (menssagemBruta) => {
    try {
      const dados = JSON.parse(menssagemBruta.toString());

      // Trata eventos específicos que precisam ser repassados
      if (dados.tipo === 'digitando') {
        // Envia notificação de "digitando" para o outro usuário
        clientes.forEach((cliente) => {
          if (cliente !== ws && cliente.readyState === 1) {
            cliente.send(JSON.stringify({ tipo: 'digitando', estado: dados.estado }));
          }
        });
      } 
      else if (dados.tipo === 'ler_mensagens') {
        // Notifica o outro usuário de que as mensagens foram lidas
        clientes.forEach((cliente) => {
          if (cliente !== ws && cliente.readyState === 1) {
            cliente.send(JSON.stringify({ tipo: 'mensagens_lidas' }));
          }
        });
      }
      else {
        // Repassa mensagens normais, edições e exclusões para o outro usuário
        clientes.forEach((cliente) => {
          if (cliente !== ws && cliente.readyState === 1) {
            cliente.send(JSON.stringify(dados));
          }
        });
      }
    } catch (e) {
      console.log('Erro ao processar mensagem:', e);
    }
  });

  ws.on('close', () => {
    clientes = clientes.filter(cliente => cliente !== ws);
    console.log(`Usuário desconectado. Total: ${clientes.length}/2`);
    
    clientes.forEach(cliente => {
      cliente.send(JSON.stringify({ tipo: 'sistema', texto: 'O outro usuário se desconectou.' }));
      // Remove o indicador de digitando se o usuário desconectar
      cliente.send(JSON.stringify({ tipo: 'digitando', estado: false }));
    });
  });
});

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => {
  console.log(`Servidor rodando na porta ${PORTA}`);
});