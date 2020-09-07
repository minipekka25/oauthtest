const express = require('express')
const http = require("http");
require('dotenv').config();
const app = express()
const server = http.createServer(app)
const socketIo = require("socket.io");
const io = socketIo(server);
const cors = require('cors')
const bodyParser = require('body-parser')
const passport = require('passport');
const cookieSession = require('cookie-session')
const session = require("express-session");
const data = require('./data')
const mongoose = require('mongoose');
const Schema = mongoose.Schema
require('./passport-setup');
const workspaceSchema = require('./schemas/workspace')
const userSchema = require('./schemas/user')
const wsmemberSchema = require('./schemas/wsmember')
const channelSchema = require('./schemas/channel')
const directSchema = require('./schemas/direct')
const directmessageSchema = require('./schemas/directmessage')
const channelmessageSchema = require('./schemas/channelmessage')
const crypto = require('crypto');


const aws = require('aws-sdk');
const multerS3 = require('multer-s3');
const multer = require('multer');
const path = require('path');


const s3 = new aws.S3({
    accessKeyId: process.env.S3_ACCESS_ID,
    secretAccessKey: process.env.S3_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET_NAME,

});

var upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.S3_BUCKET_NAME,
        key: function (req, file, cb) {
            cb(null, path.basename(file.originalname, path.extname(file.originalname)) + '__--__' + Date.now() + path.extname(file.originalname))
        }
    })
})

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Origin', req.header('origin')
        || req.header('x-forwarded-host') || req.header('referer') || req.header('host'));
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Content-Type", "application/json;charset=utf-8");
    next()
});

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

// For an actual app you should configure this with an experation time, better keys, proxy and secure
let cookie = cookieSession({
    name: 'slack-session',
    keys: ['fgyuhijf82f3y49hioj', 'dcfvgyhu8r029ergf2hdui']
})
app.use(cookie)

// Auth middleware that checks if the user is logged in
const isLoggedIn = (req, res, next) => {
    if (req.user) {
        next();
    } else {
        res.sendStatus(401);
    }
}



const rooms = io.of(/^\/\w+$/);



rooms.use((socket, next) => {

    let cookieString = socket.request.headers.cookie;

    let req = { connection: { encrypted: false }, headers: { cookie: cookieString } }
    let res = { getHeader: () => { }, setHeader: () => { } };

    cookie(req, res, () => {
        if (req.session) {
            socket.googleId = req.session.passport.user.id
        }

    })

    next();
});

rooms.on('connection', async (socket) => {

    socket.emit('newMessage', 'Admin, Welocome to workspace')
    socket.on('todo_updated', (data) => {
        socket.emit('todo_updated', data)
    })

    socket.on('todo_deleted', (data) => {
        socket.emit('todo_deleted', data)
    })

    socket.on('todo_deleted', (data) => {
        socket.emit('todo_deleted', data)
    })

    socket.on('created_channel', (data) => {
        rooms.emit('created_channel', data)
    })

    socket.on('status_changed', (data) => {
        socket.emit('status_changed', data)
    })





    socket.on('joinroom', async (ws) => {
        let wsdb = data.getDatabaseConnection(ws.workspace_id)
        const wsMember = wsdb.model('wsmember', wsmemberSchema)

        let founduser = await wsMember.findOne({ googleId: socket.googleId })

        founduser.channels.map(async (i) => await socket.join(ws.workspace_id + '&' + i))
        founduser.directs.map(async (i) => await socket.join(ws.workspace_id + '&' + i))

        founduser.online = true
        await founduser.save()
        rooms.emit('usercameonline', socket.googleId)
        socket.ws_id = ws.workspace_id

        socket.on('disconnect', async () => {
            console.log(socket.ws_id + 'disconnected')
            let wsdb = data.getDatabaseConnection(socket.ws_id)
            const wsMember = wsdb.model('wsmember', wsmemberSchema)
            let founduser = await wsMember.findOne({ googleId: socket.googleId })
            founduser.online = false
            rooms.emit('userwentoffline', socket.googleId)
            socket.ws_id = ws.workspace_id
            await founduser.save()
        })


app.use(
    cookieSession({
        maxAge:30 * 24 * 60 * 60 *1000,
        keys:[keys.cookieKey],
        domain:'http://localhost:3000',
        sameSite:'lax'
    })


    socket.on('sendmsgtoroom', async (roomid) => {

        let wsdb = data.getDatabaseConnection(roomid.ws_id)

        const channel = wsdb.model('channel', channelSchema)
        const wsMember = wsdb.model('wsmember', wsmemberSchema)
        const direct = wsdb.model('direct', directSchema)

        let foundwsuser = await wsMember.findOne({ googleId: socket.googleId })

        let schema = ''
        let coll = ''
        let newupdate = null
        if (roomid.type == 'channel') {
            schema = channelmessageSchema
            coll = 'ch-' + roomid.coll_name
            newupdate = await channel.findOne({ _id: roomid.coll_name })
        } else {
            schema = directmessageSchema
            newupdate = await direct.findOne({ _id: roomid.coll_name })
            coll = 'dm-' + await newupdate.hash
        }
        const newmsgmodel = wsdb.model(coll, schema)

        let newmsg = new newmsgmodel({
            type: roomid.msg_type,
            saved: false,
            message: roomid.msg,
            created_by: await foundwsuser
        })

        let createdmsg = await newmsg.save()

        newupdate.latest_msg = { msg: createdmsg.message, time: createdmsg.updatedAt, type: createdmsg.type }

        await newupdate.save()

        rooms.to(roomid.roomid).emit(roomid.roomid, { msg: createdmsg, id: roomid.roomid, type: roomid.type, current: roomid.coll_name })
    });
});





// io.of("/test").on("connection", socket => {
//     console.log("New client connected"+socket.id);

//      socket.on('join', (room,callback) => {
//          b.push({room:room,id:socket.id})

//          socket.join(room);

//         let g = b.filter((i)=>i.room == room)
//          io.of("/test").to(room).emit('updateUsersList', g);
//          socket.emit('newMessage', 'Admin, Welocome to '+room);

//          socket.broadcast.to(room).emit('newMessage', 'Admin, New User Joined!'+room);
//          console.table(b)
//          callback();
//      })

//     socket.on("disconnect", () => {
//         console.log("Client disconnected")
//         let h= b.filter((i)=> i.id != socket.id)
//         b = h
//         console.table(b)   
//     });
// });



// Initializes passport and passport sessions
app.use(passport.initialize());
app.use(passport.session());


// Example protected and unprotected routes
app.get('/', (req, res) => { console.log(req.user.displayName); res.send('hellos') })
app.get('/failed', (req, res) => res.send('You Failed to log in!'))

// In this route you can see that if the user is logged in u can acess his info in: req.user
app.get('/good', isLoggedIn, (req, res) => res.send(`Welcome mr ${req.user.displayName}!`))

// Auth Routes
app.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/google/callback', passport.authenticate('google', { failureRedirect: '/failed' }),
    function (req, res) {
        // Successful authentication, redirect home.
        res.redirect('/orgexplorer');
    }
);

app.post('/upload', upload.array('photos'), function (req, res, next) {

    let fileArray = req.files, fileLocation;
    const galleryImgLocationArray = [];
    for (let i = 0; i < fileArray.length; i++) {
        fileLocation = fileArray[i].location
        galleryImgLocationArray.push(fileLocation)
    }

    let response = {
        s3locationArray: galleryImgLocationArray
    }


    console.log(response)

    res.json(response)

})


app.get('/authenticated', async (req, res) => {
    if (req.user) {
        res.send('success')
    } else {
        res.send('failed')
    }
})

app.get('/search/:type/:ws_id/:collname', async (req, res) => {



})

app.post('/create/workspace', async (req, res) => {

    const msdb = data.getDatabaseConnection('black_master')
    const workspace = msdb.model('workspace', workspaceSchema)
    const user = msdb.model('user', userSchema)
    console.log(req.body.workspace_name, req.body.emoji)
    let newWorkspace = new workspace({
        name: req.body.workspace_name,
        created_by: req.user.id,
        emoji: req.body.emoji
    })

    let createWorkspace = await newWorkspace.save()
    let foundcreatedUser = await user.findOne({ googleId: req.user.id })
    foundcreatedUser.workspaces.push(createWorkspace._id)
    let updatedUser = await foundcreatedUser.save()

    let wsdb = data.getDatabaseConnection(await createWorkspace._id)

    const wsMember = wsdb.model('wsmember', wsmemberSchema)

    let newWsMember = new wsMember({
        nickName: await updatedUser.name,
        email: await updatedUser.email,
        googleId: await updatedUser.googleId,
        profile_pic: await updatedUser.picture,
        Ref: await updatedUser,
        todo: [{ task: 'Add Members', emoji: '🤝' }],
        online: false,
        status: '😎'
    })

    await newWsMember.save()



    res.send(createWorkspace)
});

app.post('/join/workspace', async (req, res) => {

    const msdb = data.getDatabaseConnection('black_master')
    const workspace = msdb.model('workspace', workspaceSchema)
    const user = msdb.model('user', userSchema)
    console.log(req.body.workspace_id)
    let found_workspace = await workspace.findOne({ _id: req.body.workspace_id })

    let foundUser = await user.findOne({ googleId: req.user.id })
    foundUser.workspaces.push(found_workspace)
    let updatedUser = await foundUser.save()



    let wsdb = data.getDatabaseConnection(await found_workspace._id)
    let modelCreator = (collectionname, schema) => {
        return wsdb.model(collectionname, schema)
    }

    const channel = wsdb.model('channel', channelSchema)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    const direct = wsdb.model('direct', directSchema)

    let newWsMember = new wsMember({
        nickName: await updatedUser.name,
        email: await updatedUser.email,
        googleId: await updatedUser.googleId,
        profile_pic: await updatedUser.picture,
        Ref: await updatedUser,
        todo: [{ task: 'Have Fun', emoji: '🥳' }],
        online: false,
        status: '😎'
    })

    let createdWsMember = await newWsMember.save()

    let found_channels = await channel.find({ private: false })
    found_channels.map(async (i) => {
        i.members.push(createdWsMember)
        await i.save()
    })

    found_channels.map((i) => {
        createdWsMember.channels.push(i)
    })
    await createdWsMember.save()


    //await found_channels.save()

    let id = req.user.id;
    let hash = crypto.createHash('md5').update(id).digest('hex');

    let newDirect = new direct({
        hash: hash,
        members: [await createdWsMember]
    })

    let directcreated = await newDirect.save()
    await createdWsMember.directs.push(await directcreated)

    let joindm = modelCreator('dm-' + directcreated.hash, directmessageSchema)

    let directmessages = new joindm({
        type: 'text',
        saved: false,
        message: `${createdWsMember.nickName} joined the chat`,
        created_by: await createdWsMember
    })

    let g = await directmessages.save()

    let newdirectupdate = await direct.findOne({ _id: directcreated._id })

    newdirectupdate.latest_msg = { msg: g.message, time: g.updatedAt }

    await newdirectupdate.save()

    let finalupdate = await createdWsMember.save()

    res.send(finalupdate)
});

app.get('/get_wp_channels_dm', async (req, res) => {
    const msdb = data.getDatabaseConnection('black_master')
    const user = msdb.model('user', userSchema)

    let foundUser = await user.findOne({ googleId: req.user.id })
    let workspaces_ids = await foundUser.workspaces
    workspaces_ids.length != 0 && await foundUser.workspaces.map(async (i) => {
        let wsdb = await data.getDatabaseConnection(i)
        const channel = wsdb.model('channel', channelSchema)
        const wsMember = wsdb.model('wsmember', wsmemberSchema)
        const direct = wsdb.model('direct', directSchema)
        try {
            let foundWsMember = await wsMember.findOne({ googleId: req.user.id }).populate({ path: 'channels', model: channel, populate: { path: 'members', model: wsMember } }).populate({ path: 'directs', model: direct, populate: { path: 'members', model: wsMember } })
            //console.log('hell'+ await foundWsMember)
            res.send(foundWsMember)
        } catch (err) {
            console.log(err);
        }
    })

})

app.get('/get/orgname/:ws_id', async (req, res) => {
    const msdb = data.getDatabaseConnection('black_master')
    const workspace = msdb.model('workspace', workspaceSchema)
    console.log(req.params.ws_id)
    try {
        let foundorg = await workspace.find({ _id: req.params.ws_id })
        res.send(foundorg)
    } catch (err) {
        res.send({ "name": "Not Found", "emoji": "👀", "_id": "123" })
    }



})



app.get('/get/workspaceslist', async (req, res) => {
    const msdb = data.getDatabaseConnection('black_master')
    const workspace = msdb.model('workspace', workspaceSchema)
    const user = msdb.model('user', userSchema)

    try {
        let foundUser = await user.findOne({ googleId: req.user.id }).populate({ path: 'workspaces', model: workspace })


        res.send(await foundUser)
    }
    catch (err) {
        console.log(err)
    }
})

app.post('/get/workspace/channels', async (req, res) => {
    let l = Object.keys(req.body)
    let j = JSON.parse(l[0])
    const wsdb = data.getDatabaseConnection(j.workspace_id)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)

    try {
        let foundmember = await wsMember.findOne({ googleId: req.user.id })
        // console.log('fff'+ foundmember)
        res.send(await foundmember)
    }
    catch (err) {
        console.log(err)
    }
})
app.post('/change/status', async (req, res) => {

    let wsdb = data.getDatabaseConnection(req.body.workspace_id)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    let foundWsMember = await wsMember.findOne({ googleId: req.user.id })
    console.log(req.body.status)
    foundWsMember.status = req.body.status
    let g = await foundWsMember.save()
    res.send(g)
})


app.post('/create/channel/onboard', async (req, res) => {

    let wsdb = data.getDatabaseConnection(req.body.workspace_id)


    const channel = wsdb.model('channel', channelSchema)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    const direct = wsdb.model('direct', directSchema)


    let createdWsMember = await wsMember.findOne({ googleId: req.user.id })

    let generalchannel = new channel({
        name: 'general',
        private: false,
        emoji: '🥴',
        members: [await createdWsMember]
    })

    let randomchannel = new channel({
        name: 'random',
        private: false,
        emoji: '👾',
        members: [await createdWsMember]
    })

    let userchannel = new channel({
        name: req.body.channel_name,
        private: false,
        emoji: req.body.emoji,
        members: [await createdWsMember]
    })

    let channelseed = [generalchannel, randomchannel, userchannel]

    let createdchannels = await channel.insertMany(channelseed)


    let id = req.user.id;
    let hash = crypto.createHash('md5').update(id).digest('hex');

    let newDirect = new direct({
        hash: hash,
        members: [await createdWsMember]
    })

    let memberfill = await wsMember.findOne({ googleId: req.user.id })
    await createdchannels.map((i) => {
        memberfill.channels.push(i)
    })

    let directcreated = await newDirect.save()
    await memberfill.directs.push(await directcreated)
    await memberfill.save()

    res.send(req.body.workspace_id)


})

app.get('/get/workspace/appdata/:ws_id', async (req, res) => {
    let wsdb = await data.getDatabaseConnection(req.params.ws_id)
    const channel = wsdb.model('channel', channelSchema)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    const direct = wsdb.model('direct', directSchema)

    try {
        let foundWsMember = await wsMember.findOne({ googleId: req.user.id }).populate({ path: 'channels', model: channel, populate: { path: 'members', model: wsMember, select: ['nickName', 'profile_pic', 'status', 'online', 'googleId'] } }).populate({ path: 'directs', model: direct, populate: { path: 'members', model: wsMember, select: ['nickName', 'profile_pic', 'status', 'online', 'googleId'] } })
        //console.log('hell'+ await foundWsMember)
        res.send(foundWsMember)
    } catch (err) {
        console.log(err);
    }

})

app.get('/get/workspace/channelmessage/:ws_id/:ch_id', async (req, res) => {
    let wsdb = await data.getDatabaseConnection(req.params.ws_id)
    const channel = wsdb.model('channel', channelSchema)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    const direct = wsdb.model('direct', directSchema)

    let modelCreator = (collectionname, schema) => {
        return wsdb.model(collectionname, schema)
    }

    try {
        let foundWsMember = await wsMember.findOne({ googleId: req.user.id }).populate({ path: 'channels', model: channel }).populate({ path: 'directs', model: direct })
        //console.log('hell'+ await foundWsMember)
        let validate_permission = await foundWsMember.channels.filter((i) => i._id == req.params.ch_id)

        if (validate_permission.length != 0) {
            let channelmessage = modelCreator('ch-' + req.params.ch_id, channelmessageSchema)
            let messages = await channelmessage.find({}).populate({ path: 'created_by', select: ['nickName', 'profile_pic', 'status'], model: wsMember })
            res.send(messages)
        }
    } catch (err) {
        console.log(err);
    }

})




app.get('/get/workspace/directmessage/:ws_id/:dm_id', async (req, res) => {
    let wsdb = await data.getDatabaseConnection(req.params.ws_id)
    const channel = wsdb.model('channel', channelSchema)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    const direct = wsdb.model('direct', directSchema)

    let modelCreator = (collectionname, schema) => {
        return wsdb.model(collectionname, schema)
    }

    try {
        let foundWsMember = await wsMember.findOne({ googleId: req.user.id }).populate({ path: 'channels', model: channel }).populate({ path: 'directs', model: direct })

        let validate_permission = await foundWsMember.directs.filter((i) => i._id == req.params.dm_id)

        if (validate_permission.length != 0) {
            let directmessage = modelCreator('dm-' + validate_permission[0].hash, directmessageSchema)
            let messages = await directmessage.find({}).populate({ path: 'created_by', model: wsMember })
            res.send(messages)
        }
    } catch (err) {
        console.log(err);
    }

})

app.post('/create/channel/:ws_id', async (req, res) => {

    let wsdb = await data.getDatabaseConnection(req.params.ws_id)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    const channel = wsdb.model('channel', channelSchema)

    let foundusers = await wsMember.find({})


    let userchannel = new channel({
        name: req.body.channel_name,
        private: false,
        emoji: req.body.emoji,
        members: await foundusers
    })

    let g = await userchannel.save()

    let channel_name = wsdb.model('ch-' + g._id, channelmessageSchema)

    let p = foundusers.filter((u) => u.googleId != req.user.id)

    let newjoinmsg = new channel_name({
        type: 'text',
        saved: false,
        message: `${req.user.displayName} created ${req.body.channel_name} and joined with ${p.map((j) => j.nickName + ' ')}`,
        created_by: await wsMember.findOne({ googleId: req.user.id })
    })

    let newmsg = await newjoinmsg.save()

    let newchannelupdate = await channel.findOne({ _id: g._id })
    newchannelupdate.latest_msg = { msg: newmsg.message, time: newmsg.updatedAt }
    await newchannelupdate.save()

    let h = foundusers.map(async (j) => {
        let y = await wsMember.findOne({ googleId: j.googleId })
        y.channels.push(g)
        return await y.save()

    })
    console.log(req.user)
    let result = await Promise.all(h)

    res.send(result)

})

app.post('/create/direct/:ws_id', async (req, res) => {

    let wsdb = await data.getDatabaseConnection(req.params.ws_id)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)

    let current_user = await wsMember.findOne({ googleId: req.user.id })
    let direct_user = await wsMember.findOne({ googleId: req.body.googleId })

    const direct = wsdb.model('direct', directSchema)

    let newdirect = new direct({
        hash: req.body.hash,
        members: [current_user, direct_user]
    })

    let created_direct = await newdirect.save()

    current_user.directs.push(created_direct)
    direct_user.directs.push(created_direct)

    await current_user.save()
    await direct_user.save()

    let directmsg = wsdb.model('dm-' + req.body.hash, directmessageSchema)

    let directmessages = new directmsg({
        type: 'text',
        saved: false,
        message: `${current_user.nickName} created and joined the chat along with ${direct_user.nickName}`,
        created_by: await current_user
    })

    let g = await directmessages.save()

    let newdirectupdate = await direct.findOne({ _id: created_direct._id })

    newdirectupdate.latest_msg = { msg: g.message, time: g.updatedAt }

    let k = await newdirectupdate.save()

    res.send(k)
})

app.post('/create/task/:ws_id', async (req, res) => {
    let wsdb = await data.getDatabaseConnection(req.params.ws_id)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)

    let foundWsMember = await wsMember.findOne({ googleId: req.user.id })
    foundWsMember.todo.push(req.body)
    let updatedtodo = await foundWsMember.save()
    res.send(updatedtodo)
})

app.post('/delete/task/:ws_id', async (req, res) => {
    let wsdb = await data.getDatabaseConnection(req.params.ws_id)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    let foundWsMember = await wsMember.findOne({ googleId: req.user.id })
    let deletedtodo = foundWsMember.todo.filter((i) => i.task != req.body.task)
    foundWsMember.todo = deletedtodo
    let updatedtodo = await foundWsMember.save()
    res.send(updatedtodo)
})

app.get('/get/directslot/:ws_id', async (req, res) => {
    let wsdb = data.getDatabaseConnection(req.params.ws_id)
    const direct = wsdb.model('direct', directSchema)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    foundusers = await wsMember.find({})
    let b = await foundusers.filter((i) => i.googleId != req.user.id)
    const g = b.map(async (j) => {
        let gid = parseInt(j.googleId)
        let ugid = parseInt(req.user.id)
        let id = ''
        if (gid > ugid) {
            id = gid + ugid
        } else {
            id = ugid + gid
        }
        let hash = crypto.createHash('md5').update(id.toString()).digest('hex')

        let find = await direct.findOne({ hash: hash })
        if (find == null) {
            return { googleId: j.googleId, name: j.nickName, hash: hash }
        } else { return null }

    })
    let results = await Promise.all(g)

    res.send(results)

})



app.get('/search/messages/:collname/:schema/:ws_id/:search_query', async (req, res) => {

    let wsdb = data.getDatabaseConnection(req.params.ws_id)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    let modelCreator = (collectionname, schema) => {
        return wsdb.model(collectionname, schema)
    }

    let schema = ''

    if (req.params.schema == 'channel') {
        schema = channelmessageSchema
    } else {
        schema = directmessageSchema
    }

    const regex = new RegExp(escapeRegex(req.params.search_query), 'gi');

    let model = modelCreator(req.params.collname, schema)
    let foundmessages = await model.find({ message: regex }).populate({ path: 'created_by', model: wsMember })

    res.send(foundmessages.filter((i) => i.type == 'text'))

})

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};


app.post('/create/joinmessage', async (req, res) => {

    let wsdb = data.getDatabaseConnection(req.body.workspace_id)

    const channel = wsdb.model('channel', channelSchema)
    const wsMember = wsdb.model('wsmember', wsmemberSchema)
    const direct = wsdb.model('direct', directSchema)

    let modelCreator = (collectionname, schema) => {
        return wsdb.model(collectionname, schema)
    }




    let userobj = await wsMember.findOne({ googleId: req.user.id }).populate({ path: 'channels', model: channel }).populate({ path: 'directs', model: direct, populate: { path: 'members', model: wsMember } })

    let joindm = modelCreator('dm-' + userobj.directs[0].hash, directmessageSchema)

    let directmessages = new joindm({
        type: 'text',
        saved: false,
        message: `${userobj.nickName} joined the chat`,
        created_by: await userobj
    })

    let g = await directmessages.save()

    let newdirectupdate = await direct.findOne({ _id: userobj.directs[0]._id })

    newdirectupdate.latest_msg = { msg: g.message, time: g.updatedAt }

    await newdirectupdate.save()

    let msgcreate = async (a) => {
        let channel_name = 'ch-' + a._id;
        let joinchannel = modelCreator(channel_name, channelmessageSchema)
        let channelmessage = new joinchannel({
            type: 'text',
            saved: false,
            message: `${userobj.nickName} joined ${a.name}`,
            created_by: await userobj
        })
        let t = await channelmessage.save()

        let newchannelupdate = await channel.findOne({ _id: a._id })
        newchannelupdate.latest_msg = { msg: t.message, time: t.updatedAt }
        await newchannelupdate.save()
    }

    userobj.channels.map(async (i) => {
        msgcreate(i)
    })

    res.send(userobj)
})







app.get('/logout', (req, res) => {
    req.session = null;
    req.logout();
    res.redirect('/');
})


//app.listen(4000, ()=> console.log('app running in port 4000'))
const port = process.env.PORT || 5000
server.listen(port, () => console.log(`Example app listening on port ${5000}!`))
