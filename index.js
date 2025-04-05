import express from 'express';
import bodyParser from 'body-parser';
import env from "dotenv";
import pg from 'pg';
import axios from 'axios';
import http from 'http';    
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';



//Express configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express()
const port = 3000

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

//Enviroment variables
env.config();

//Middleware
app.use(bodyParser.urlencoded({ extended: false }))


const client = new pg.Client({                              //Client Config for database
    user: process.env.DBUSER,
    password: process.env.DBPASSWORD,
    host: process.env.DBHOST,
    port: process.env.DBPORT,
    database: process.env.DBNAME,
})
client.connect()

//Ejemplo para abrir un websocket con el cliente (tableta)
io.on('connection', (socket) => {
    console.log('Un cliente se conectó');

    socket.emit('mensaje', '¡Hola desde el servidor!');

    socket.on('cliente_dice', (data) => {
        console.log('Cliente dice:', data);
    });
});



//Home Assistant API REST-----------------------------------------------------------------------

const apiURL = 'http://homeassistant.local:8123/api/states/';

let configHAAPI = {                                            //Configuration for API request
  method: 'get',
  maxBodyLength: Infinity,
  url: '',
  headers: { 
    'Authorization': 'Bearer '+process.env.HA_API_TOKEN
  }
};              

async function getHAStates() {       //Se queda como prueba para jalar datos de la BD                                
    const result = await client.query('SELECT * FROM iotDevices');
    return result.rows;
}

async function updatetHAStates() {                              //Para actualizar todos los dispositivos
    let haState =  await client.query('SELECT * FROM iotDevices');
    console.log('Voy a pedir valores');
    for (const device of haState.rows) {
        let updatedState = await test(device.entity);
        if(updatedState == "off"){
            updatedState=0;
        }else if(updatedState =="on"){
            updatedState = 1;
        }
        await client.query('UPDATE iotDevices SET value=$1 WHERE entity=$2',[updatedState,device.entity]);
        
        
    }
    console.log('Ya termine actualizacion')
    return getHAStates();
}

async function test(devEntity){
    try {
        configHAAPI.url = apiURL + devEntity;
        const res = await axios.request(configHAAPI);
        return res.data.state;
    } catch (error) {
        console.log('Error with device:', devEntity);
        return 0; // O algún valor que te sirva como fallback
    }
    
    
}

async function checkDeviceState(entity){                //Para actualizar solo un dispositivo
    console.log('Empiezo check device')
    configHAAPI.url = apiURL+entity;
    let state;
    axios.request(configHAAPI)
        .then(async (response) => {
            state = response.data.state;
            console.log(response.data)
            if(state == "off"){
                state=0;
            }else if(state =="on"){
                state = 1;
            }
            await client.query('UPDATE iotDevices SET value=$1 WHERE entity=$2',[state,entity]);
        })
        .catch((error) => {
        console.log("checkDeviceState error: ");
        }); 
}


//HomeAssistant API Websocket------------------------------------------------------------

var idHA = 1;                               //Variabale para identificar peticiones en HA websocket
var haConnected = false;
var wbSkt = new WebSocket(process.env.HA_URL);
connectToHomeAssistant();


function connectToHomeAssistant(){              //Conecta a HA y activa el eventlistener
    wbSkt = new WebSocket(process.env.HA_URL);
    wbSkt.onopen = async function (event) {
        //console.log("WebSocket connection opened:", event);
        wbSkt.send(JSON.stringify({ type: "auth", access_token: process.env.HA_TOKEN}))
    };

    wbSkt.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "event") {
            //console.log("Event", data.event.event_type, data.event.data.entity_id, data.event.data);
            if(data.event.event_type=='state_changed'){
                console.log(data.event.data, " Cambio");
            }
        } else {
            console.log("Message from event listener", data);
            if(data.type=== "auth_ok"){
                wbSkt.send(
                    JSON.stringify(
                        {
                            "id": idHA,
                            "type": "subscribe_events",
                            "event_type": "state_changed"
                          }
                    )
                )
                idHA++;
            }
        }
 
    });

    
    haConnected = true;
    return wbSkt
}

function send(payload,socket) {             //Envia mensajes a home assistant
    socket.send(JSON.stringify(payload));
}

function closeConnection(){
    wbSkt.close();
    haConnected = false;
    console.log('End connection')
}

//Server pages and services----------------------------------------------------------------------

app.get('/', async (req, res) => {
    
    console.log('Holaaa')
    //getHAStates().then((data)=>{
    //    res.render('smartHome.ejs',{devices:data})
    //});
    updatetHAStates().then((data)=>{
        console.log('Cargar pagina')
        res.render('smartHome.ejs',{devices:data})
    });

})

app.get('/connect',  (req, res) => {
    //Agregar aqui la funcion de connect con validaciones
    console.log('hello')
    res.redirect('/')
})

app.get('/disconnect',  (req, res) => {
    //Agregar aqui la funcion de connect con validaciones
    console.log('bye bye')
    res.redirect('/')
})

app.post('/action', async(req, res) => {
    let entity = req.body.turnDevice;
    let domain = '';
    let command = '';
    console.log('Primero consulto DB');
    let deviceState = await client.query("SELECT * FROM iotDevices WHERE entity=$1",[entity]);
    console.log(typeof(deviceState.rows));
    //Select command
    if(deviceState.rows[0].value == 0){
        command = "turn_on";
    }else if(deviceState.rows[0].value ==1){
        command = "turn_off";
    }
    console.log('Seleccionamos comando: ' + command)
    //Select device domain
    if(deviceState.rows[0].type == 'luces'){
        domain = 'light';
    }else if(deviceState.rows[0].type =='sensor'){
        domain = 'switch'
    }else if(deviceState.rows[0].type == 'relevador'){
        console.log('not ready')
    }
    console.log('Seleccionamos dominio: ' + domain)
    
    //Send message to Home Assistant
    send({
        "id": idHA,
        "type": "call_service",
        "domain": domain,
        "service": command,
        "target": {
          "entity_id": entity
        }},wbSkt);
    idHA++;
    
    console.log('Actualizamos db')
    await client.query('UPDATE iotDevices SET value=0 WHERE entity=$1',[entity]);
    console.log('Mandamos a actualizar  pagina')

    //res.redirect('/')
})

//Books storage services-----------------------------
/* Book services
//Book History with Postgres database----------------------------------------------------------

var sort = 'author';                        //Variable para determinar el tipo de orden en los libros

async function checkBooks() {
    const result = await client.query('SELECT * FROM books');
    return result;
}

async function addBook(data) {
    let info = await client.query(
        "INSERT INTO books (title,author,readdate,summary,score) VALUES ($1, $2,$3,$4,$5) RETURNING id", 
        [data.title,data.author,data.readDate,data.summary,data.score]    
    );
}

function sortItems (items,criteria){
    let aux = []
    for (let i = 0; i < items.length -1; i++) {
      for (let j = 0; j < items.length -1; j++) {
        if(criteria == 'score' || criteria == 'read_date'){
          if (eval('items[j].' + criteria) < eval('items[j+1].' + criteria)) {
            aux = items[j];
            items[j] = items[j+1];
            items[j+1] = aux;
          } 
        }else{
          if (eval('items[j].' + criteria) > eval('items[j+1].' + criteria)) {
            aux = items[j];
            items[j] = items[j+1];
            items[j+1] = aux;
          } 
        }
            
      }
    }
    return items;
  }


app.get('/books', async (req, res) => {
    let data = await checkBooks();
    res.render('books.ejs', {books : data.rows,order:sort})
})

app.post('/books',async (req,res)=>{
    let data = await checkBooks();
    let option = req.body.sortOption
    data = sortItems(data.rows,option)
    res.render('books.ejs', {books : data})
})

app.post('/books/edit', async (req, res) => {
    let info = await client.query('SELECT * FROM books WHERE id=$1',[req.body.book]);
    let book = info.rows[0]
    console.log(book)
    res.render('editBook.ejs',{data:book})
})

app.post('/books/editBook', async (req, res) => {
    console.log(req.body.score)
    let newData = req.body;
    await client.query('UPDATE books SET title=$1,author=$2,readdate=$3,summary=$4,score=$5 WHERE id=$6',
        [newData.title,newData.author,newData.readDate,newData.summary,newData.score,newData.id]);
    res.redirect('/books')

})

app.get('/books/new', (req, res) => {
    res.render('newBook.ejs')
    })

app.post('/books/new',(req, res) => {
    addBook(req.body)
    res.redirect('/books');
})

app.post('/books/delete', async (req, res) => {
    let bookID = req.body.book
    await client.query('DELETE FROM books WHERE id=$1',[bookID]);
    res.redirect('/books');
})
*/


server.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})