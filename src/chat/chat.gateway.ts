import { 
  WebSocketGateway, 
  SubscribeMessage, 
  MessageBody, 
  ConnectedSocket, 
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private userSockets: Map<string, string> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers['authorization']?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      
      this.userSockets.set(userId, client.id);
      client.data.user = payload;
      
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.user?.sub;
    if (userId) {
      this.userSockets.delete(userId);
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { receiverId: string, content: string }
  ) {
    const senderId = client.data.user.sub;
    
    try {
      const message = await this.chatService.sendMessage(
        senderId, 
        payload.receiverId, 
        payload.content
      );
      
      const receiverSocketId = this.userSockets.get(payload.receiverId);
      
      if (receiverSocketId) {
        this.server.to(receiverSocketId).emit('receive_message', message);
      }
      
      return { event: 'message_sent', data: message };
    } catch (error: any) {
      return { event: 'error', data: error.message };
    }
  }
}
