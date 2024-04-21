const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express()
const port = process.env.PORT || 5000

// middle ware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.jbxtt4r.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send('Unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        if(err){
            return res.status(403).send({message: 'forbidden access'})
        }
        req.decoded = decoded;
        next();
    })
}


async function run(){
    try{
        const categoriesCollection = client.db('laptopResale').collection('categories');
        const productsCollection = client.db('laptopResale').collection('products');
        const bookingCollection = client.db('laptopResale').collection('bookings');
        const usersCollection = client.db('laptopResale').collection('users');
        const paymentsCollection = client.db('laptopResale').collection('payments');

        const verifyAdmin = async (req, res, next) =>{
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        const verifySeller = async (req, res, next) =>{
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'seller') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        app.get('/categories' , async(req , res)=>{
           const query = {};
           const categories = await categoriesCollection.find(query).toArray();
           res.send(categories);      
        })

        app.get('/category/:id' , async(req , res)=>{
           const id = req.params.id;
           const query = {category_id:id}
           const product = await productsCollection.find(query).toArray();
           res.send(product);
        })


        app.get('/bookings' , verifyJWT, async(req , res)=>{
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if(email !== decodedEmail){
                return res.status(403).send({message: 'forbidden access'}); 
            }

            const query = {
               email: email 
            } 
            const bookings = await bookingCollection.find(query).toArray()
            res.send(bookings);
        })

        app.get('/bookings/:id' , async(req , res)=>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)}
            const booking = await bookingCollection.findOne(query)
            res.send(booking);        
        })

        app.post('/bookings' , async(req , res)=>{            
            const booking = req.body;
            const result = await bookingCollection.insertOne(booking); 
            res.send(result); 
        })

        app.post("/create-payment-intent", async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;
          
            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: amount,
                "payment_method_types": [
                    "card"
                ],
            });
          
            res.send({
              clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) =>{
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.bookingId;
            const product_id = payment.productId;
            const filter = {_id: ObjectId(id)}
            const query = {_id: ObjectId(product_id)}
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await bookingCollection.updateOne(filter, updatedDoc);
            const updatedProduct = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        app.get('/jwt' , async(req , res)=>{
            const email = req.query.email
            const query = {
                email: email 
            } 
            const user = await usersCollection.findOne(query);
            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1d'});
                return res.send({accessToken: token});
            }
            res.status(403).send({accessToken: ''})
        })

        app.get('/allproducts' , async(req , res)=>{
            const query = {};
            const allproducts = await productsCollection.find(query).toArray();
            res.send(allproducts);      
         })

        app.get('/products' , verifyJWT, async(req , res)=>{
            const email = req.query.email;
            const query = {
               seller_email: email
            }
            const products = await productsCollection.find(query).toArray();
            res.send(products);
        })

        app.post('/products' , verifyJWT, verifySeller, async(req , res)=>{
         const product = req.body;
         const date = new Date();
         const result = await productsCollection.insertOne({...product, time:date});
         res.send(result);
        })

        app.delete('/products/:id' , async(req , res)=>{
            const id = req.params.id;
            const filter = {_id:ObjectId(id)}
            const result = await productsCollection.deleteOne(filter);
            res.send(result);
        })

        app.patch('/advertise/:id' ,verifyJWT, async (req, res) => {
            const id = req.params.id;
            const isAdvertised = req.body.isAdvertised;
            const query = { _id: ObjectId(id) }
            const updatedDoc = {
                $set:{
                    isAdvertised: isAdvertised
                }
            }
            const result = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        app.patch('/reports/:id' , async (req, res) => {
            const id = req.params.id;
            const reported = req.body.reported;
            const query = { _id: ObjectId(id) }
            const updatedDoc = {
                $set:{
                    reported: reported
                }
            }
            const result = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        app.get('/reports' , async(req , res)=>{
            const query = {
                reported: true
            }
            const products = await productsCollection.find(query).toArray();
            res.send(products);
        })

        app.get('/advertise' , async(req , res)=>{
            const query = {
                isAdvertised: true
            }
            const products = await productsCollection.find(query).toArray();
            res.send(products);
        })

        app.post('/users' , async(req , res)=>{
            const user = req.body;
            const query = {
                email: user.email
            }
            const alreadyUser = await usersCollection.findOne(query);
            if(alreadyUser){
                return res.send({acknowledged: true});
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);        
        })

        app.get('/buyers' , verifyJWT, async(req , res)=>{
            const query = {
               role: 'buyer'
            }
            const buyers = await usersCollection.find(query).toArray();
            res.send(buyers);
        })
        
        app.get('/sellers' , verifyJWT, async(req , res)=>{
            const query = {
               role: 'seller'
            }
            const sellers = await usersCollection.find(query).toArray();
            res.send(sellers);
        })

        app.get('/users/:email' , async(req , res)=>{
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send(user);
        })

        app.patch('/users/:id' , async (req, res) => {
            const id = req.params.id;
            const verified = req.body.verified;
            const query = { _id: ObjectId(id) }
            const updatedDoc = {
                $set:{
                    verified: verified
                }
            }
            const result = await usersCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        app.delete('/users/:id' , async(req , res)=>{
            const id = req.params.id;
            const filter = {_id:ObjectId(id)}
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })
        
        app.get('/users/seller/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isSeller: user?.role === 'seller' });
        })

    }
    finally{

    }
}
run().catch(error => console.error(error))


 

app.get('/' , (req , res)=>{
   res.send('Laptop resale server is running :)')
})

app.listen(port , ()=> console.log('> Laptop Resale Server is running on port : ' + port))