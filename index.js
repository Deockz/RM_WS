import express from 'express';
import bodyParser from 'body-parser';
import env from "dotenv";

const app = express()
const port = 3000

env.config();
app.use(bodyParser.urlencoded({ extended: false }))

var haMessage;
var authReq = false;
var idHA = 1;

//Acceso a websocket------------------------------------------------------------
const haToken = process.env.HA_TOKEN;
const wbSkt = new WebSocket(process.env.HA_URL);

function send(payload) {
    wbSkt.send(JSON.stringify(payload));
}

function ping() {
    send({
        id:idHA,
        type: "ping",
      });
    idHA++;
}


function turnLight(){
    send({
        id:idHA,
        type: "call_service",
        domain: "light",
        service:"turn_on",
        service_data: {
            brightness:255
        },
        target:{
            entity_id:"light.hue_color_lamp_1_2"
        }
        
      });
    idHA++;
}

function authenticate() {
    send({
      type: "auth",
      access_token: haToken,
    });
  }

wbSkt.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "event") {
        console.log("Event", data.event.event_type, data.event.data.entity_id, data.event.data);
    } else {
        console.log("message", data);
    }
});

wbSkt.onopen = async function (event) {
    console.log("WebSocket connection opened:", event);
    authenticate();
};

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
                ping();
            }
            if (req.body.action == 'cuarto') {
                turnLight();
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