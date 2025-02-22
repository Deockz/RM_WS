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
    password: process.env.DBPASSWORD,
    host: process.env.DBHOST,
    port: process.env.DBPORT,
    database: process.env.DBNAME,
})
client.connect()

var haMessage;
var haConnected = false;
var idHA = 1;
const haToken = process.env.HA_TOKEN;
const authPayload = {
    type: "auth",
    access_token: haToken,
  };
var wbSckt;
var sort = 'author';

//Book History with Postgres database

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

//End------------------------------------------------------------------


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

//End------------------------------------------------------------------


//Express services----------------------------------------------------------------------
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

app.post('/books/delete', async (req, res) => {
    let bookID = req.body.book
    await client.query('DELETE FROM books WHERE id=$1',[bookID]);
    res.redirect('/books');
})

//End------------------------------------------------------------------
    

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})