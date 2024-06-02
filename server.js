import express from 'express'
import { Server, Socket } from 'socket.io'
import cors from "cors"
import { corsOptions } from './config/corOptions'
import { allowedOrigins } from './config/allowedOrigins'

const PORT = process.env.PORT || 4000
const ADMIN = "Admin"

const app = express();
app.use(cors(corsOptions));

const expressServer = app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
})

const GamesState = {
    users: [],
    boardStates: [],
    setUsers: function (newUsersArray){
        this.users = newUsersArray
    },
    setBoardStates: function (newBoardStates){
        this.boardStates = newBoardStates
    }
}

const io = new Server(expressServer, {
    cors: {
        origin:  allowedOrigins
    }
})

io.engine.on("connection_error", (err) => {
    console.log(err.req);      // the request object
    console.log(err.code);     // the error code, for example 1
    console.log(err.message);  // the error message, for example "Session ID unknown"
    console.log(err.context);  // some additional error context
  });

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    socket.emit('message', buildMsg(ADMIN, "Welcome to Arc's Chess App!"))

    socket.on('createRoom', ({name, roomId, type}) =>{
        const user = addUser(socket.id, name, roomId, type)

        console.log(user)
        socket.join(user.roomId)

        socket.emit('message', buildMsg(ADMIN, `${user.name}, your room id is: ${user.roomId}`))
    })

    io.engine.on("connection_error", (err) => {
        console.log(err.req);      // the request object
        console.log(err.code);     // the error code, for example 1
        console.log(err.message);  // the error message, for example "Session ID unknown"
        console.log(err.context);  // some additional error context
      });

    socket.on('enterRoom',  ({name, roomId, type}) =>{
        const roomUsers = getUsersInRoom(roomId)

        if(roomUsers.length === 0){
            socket.emit('message', buildMsg(ADMIN, `Room ${roomId} does not exist. Please refresh and enter a valid room`))
        }else { 
            const spotAvailable = isPlayerTwoSpotAvailable(roomUsers)      
            if(type === "black" && !spotAvailable){
                //Rejoin as spectator             
                socket.emit('turnToSpectator')
            }else{

                const user = addUser(socket.id, name, roomId, type)                     
                socket.join(user.roomId)
                if(type === "spectator"){
                    const bstate = GamesState.boardStates.find(b=> b.roomId === roomId)
                    socket.emit('getBoardState', )
                    socket.emit('message', buildMsg(ADMIN, `${user.name} have joined room ${user.roomId} as a spectator`))
                    socket.broadcast.to(user.roomId).emit('message', buildMsg(ADMIN, `${user.name} has joined the room as a spectator`))
                }else{
                    user.game = {boardState: "start",moveCount : 1 }
                    io.to(user.roomId).emit('gameStart', user.game)
                    socket.emit('message', buildMsg(ADMIN, `${user.name} have joined room ${user.roomId}`))
                    socket.broadcast.to(user.roomId).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`))
                }
                
            }
        }
    })

    socket.on('message', (text)=>{
        const user = getUser(socket.id)

        if(user){
            io.to(user.roomId).emit('message', buildMsg(user.name, text))
        }
    })

    socket.on('inCheck', () => {
        const user = findOpponent(socket.id)
        if(user){
            io.to(user.roomId).emit('inCheck', `${user.name} is in check!`);
        }
    })

    socket.on('isCheckMate', () => {
        const user = getUser(socket.id)
        if(user){
            io.to(user.roomId).emit('isCheckMate', );
        }
    })

    socket.on('isDraw', () => {
        const user = getUser(socket.id)
        if(user){
            io.to(user.roomId).emit('isDraw', );
        }
    })

    // socket.on('isGameOver', () => {
    //     const user = getUser(socket.id)
    //     if(user){
    //         io.to(user.roomId).emit('isGameOver', );
    //     }
    // })

    socket.on('isStaleMate', () => {
        const user = getUser(socket.id)
        if(user){
            io.to(user.roomId).emit('isStaleMate', );
        }
    })

    socket.on('isThreefoldRepetition', () => {
        const user = getUser(socket.id)
        if(user){
            io.to(user.roomId).emit('isThreefoldRepetition', );
        }
    })

    socket.on('turnOver', (move)=> {
        const user = getUser(socket.id)
        if(user){
            socket.broadcast.to(user.roomId).emit('turnOver', move)
        }
    })

    socket.on('boardState', ({roomId, boardState}) => {
        const newBoardState = addBoardState(roomId, boardState);
    })

    socket.on('getBoardState', () => {
        const user = getUser(socket.id)
        const boardState = getBoardState(user?.roomId)
        socket.emit('getBoardState', boardState)
    })

    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeavesGame(socket.id)

        if(user){
            io.to(user.roomId).emit('message', buildMsg(ADMIN, `${user.name} has left the room`))
            removeUser(socket.id)
        }
    })

    // socket.on('message')

})

function buildMsg(name, text){
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date())
    }
}
function addUser(id, name, roomId, type){
    const user = {id, name, roomId, type}
    
    GamesState.setUsers([...GamesState.users.filter( user => user.id !==id), user])
    return user
}

function isPlayerTwoSpotAvailable(roomUsers){
    const playerTwo = roomUsers.find(user => user.type === "black")
    if(playerTwo) return false
    
    return true
}

function findOpponent(id) {
    const user = getUser(id)
    const usersInRoom = getUsersInRoom(user?.roomId)
    const opponent = usersInRoom.find(usr => usr.type !== user.type 
        && usr.type !== "spectator")
       
    return opponent 
}

function addBoardState(roomId, boardState){
    const newBoardState = {roomId, boardState}

    GamesState.setBoardStates([...GamesState.boardStates.filter( newBoard =>
        newBoard.roomId !== roomId), newBoardState])
    return newBoardState;
}

function getBoardState(roomId){
    return GamesState.boardStates.find(bStates => bStates.roomId === roomId) 
}

function removeUser(id){
    GamesState.setUsers.filter(user => user.id !== id)
}

function getUser(id) {
    return GamesState.users.find(user => user.id === id)
}

function getUsersInRoom(roomId) {
    return GamesState.users.filter(user => user.roomId === roomId)
}

function userLeavesGame(id){
    GamesState.setUsers( GamesState.users.filter(user => user.id !== id))
}
