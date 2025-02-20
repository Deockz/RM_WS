import express from 'express';
import bodyParser from 'body-parser';
import env from "dotenv";
import pg from 'pg';

const app = express()
const port = 3000

env.config();

app.use(bodyParser.urlencoded({ extended: false }))
const client = new pg.Client({
    user: process.env.DBUSER,
    password: process.env.DBPSSWRD,
    host: process.env.DBHOST,
    port: process.env.DBPORT,
    database: process.env.DBNAME,
})


async function checkItems() {
  const result = await client.query('SELECT * FROM users');
  console.log( result.rows);  
}
checkItems()

var haMessage;
var haConnected = false;
var idHA = 1;
const haToken = process.env.HA_TOKEN;
const authPayload = {
    type: "auth",
    access_token: haToken,
  };
var wbSckt;


//HomeAssistant websocket------------------------------------------------------------

function connect(){
    var wbSkt = new WebSocket(process.env.HA_URL);
    wbSkt.onopen = async function (event) {
        console.log("WebSocket connection opened:", event);
        wbSkt.send(JSON.stringify(authPayload))
    };
    wbSkt.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "event") {
            console.log("Event", data.event.event_type, data.event.data.entity_id, data.event.data);
        } else {
            console.log("message", data);
        }
    });
    haConnected = true;
    return wbSkt
}


function send(payload,socket) {
    socket.send(JSON.stringify(payload));
}


function turnLight(entity,action,socket){
    send({
        id:idHA,
        type: "call_service",
        domain: "light",
        service:"turn_"+ action,
        target:{
            entity_id:entity
        }
        
      },socket);
    idHA++;
}


function closeConnection(socket){
    socket.close();
    haConnected = false;
    console.log('End connection')
}



//End websocket------------------------------------------------------------------

app.get('/', (req, res) => {
  res.render('index.ejs')
})

app.get('/objectives', (req, res) => {
    res.render('objectives.ejs')
})

app.get('/smartHome', (req, res) => {
res.render('smartHome.ejs')

})

app.post('/action', (req, res) => {
    console.log(req.body.action)
    let connect_to_HA = false;
    if (connect_to_HA) {
        
    }else{
        try {
            if (req.body.action == 'connect') {
                wbSckt = connect();
            }
            if (req.body.action == 'disconnect') {
                closeConnection(wbSckt);
            }
            if (req.body.action == 'cuartoOn') {
                turnLight('light.hue_color_lamp_1_2','on',wbSckt);
            }
            if (req.body.action == 'cuartoOff') {
                turnLight('light.hue_color_lamp_1_2','off',wbSckt);
            }
        } catch (error) {
            console.log(error)
        }
    }
    res.redirect('/smartHome')
})
    

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})