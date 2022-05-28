const express = require('express')
const cors = require('cors');
require('dotenv').config();
const app = express()
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@nnabi-ppml.vgskx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });;



function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized Access" });
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "Forbidden Access" })
        }
        req.decoded = decoded;
        next();
    })
}



async function run() {
    try {
        await client.connect()
        console.log("DB Connected")
        const productCollection = client.db('nnabi-ppml').collection('products');
        const reviewCollection = client.db('nnabi-ppml').collection('reviews');
        const orderCollection = client.db('nnabi-ppml').collection('orders');
        const usersCollection = client.db('nnabi-ppml').collection('users');


        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await usersCollection.findOne({ email: requester })
            if (requesterAccount.role === "admin") {
                next();
            }
            else {
                res.status(403).send({ message: "Forbidden" });
            }
        }


        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })


        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const totalCost = req.body.totalCost;
            const amount = totalCost * 100;
            console.log(totalCost);
            if (totalCost) {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: 'usd',
                    payment_method_types: ['card']
                });
                res.send({ clientSecret: paymentIntent.client_secret })
            }
        });


        app.get('/product', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const products = await (await cursor.toArray()).reverse();
            res.send(products);
        })


        app.post('/product', verifyJWT, verifyAdmin, async (req, res) => {
            const product = req.body;
            const result = await productCollection.insertOne({ product });
            console.log(result);
            res.send(result);
        })


        app.get('/user', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            console.log(email);
            const user = await usersCollection.find(query).toArray();
            console.log(user);
            res.send(user);
        })


        app.get('/alluser', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const cursor = usersCollection.find(query);
            const user = await cursor.toArray();
            res.send(user);
        })


        app.delete('/alluser/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })


        app.get('/product/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const cursor = productCollection.find(query);
            const products = await cursor.toArray();
            res.send(products);
        })


        app.delete('/product/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = productCollection.deleteOne(query);
            res.send(result);
        })


        app.delete('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = orderCollection.deleteOne(query);
            res.send(result);
        })


        app.get('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await orderCollection.findOne(query);
            res.send(result);
        })


        app.put('/product', verifyJWT, async (req, res) => {
            const id = req.body.id;
            const newQuantity = req.body.newProductQuantity;
            const query = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    availableQty: newQuantity
                }
            }
            const result = await productCollection.updateOne(query, updateDoc);
            res.send(result);
        })


        app.patch('/alluser/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await usersCollection
                .findOne({ email: requester });
            if (requesterAccount.role === "admin") {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: "admin" }
                };

                const result = await usersCollection.updateOne(filter, updateDoc);
                res.send(result);

            }
            else {
                res.status(403).send({ message: "forbidden" })
            }


        })


        app.put('/allorder', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.body.id;
            const query = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    shipment: true
                }
            }
            const result = await orderCollection.updateOne(query, updateDoc);
            res.send(result);
        })

        app.patch('/allorder/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const transactionId = req.body.transactionId;
            console.log(id)
            console.log(transactionId);

            const query = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    isPaid: true,
                    transactionId: transactionId
                }
            }
            const result = await orderCollection.updateOne(query, updateDoc);
            res.send(result);
        })


        app.patch('/user', verifyJWT, async (req, res) => {
            const user = req.body;
            console.log(user);
            const email = req.query.email;
            const query = { email: email }
            const updateDoc = {
                $set: {
                    name: user.name,
                    email: user.email,
                    education: user.education,
                    adress: user.adress,
                    phone: user.phone,
                    company: user.company,
                    image: user.image
                }
            }
            const result = await usersCollection.updateOne(query, updateDoc);
            res.send(result);
        })


        app.post('/order', verifyJWT, async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result);
        })

        app.post('/review', verifyJWT, async (req, res) => {
            const review = req.body.reviewData;
            console.log(review);
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        })

        app.get('/review', async (req, res) => {
            const query = {};
            const reviews = await (await reviewCollection.find(query).toArray()).reverse();
            res.send(reviews);
        })

        app.get('/order', verifyJWT, async (req, res) => {
            const buyer = req.query.buyer
            const query = { buyer: buyer };
            const orders = await orderCollection.find(query).toArray();
            res.send(orders);
        })


        app.get('/allorder', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const orders = await orderCollection.find(query).toArray();
            res.send(orders);
        })


        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const user = req.body;
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };

            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1y' })
            res.send({ result, token });

        })


    }
    finally {

    }
}



run().catch(console.dir)


app.get('/', (req, res) => {
    res.send('Hello From NNABI Hospital')
})

app.listen(port, () => {
    console.log(`listening on port ${port}`)
})
