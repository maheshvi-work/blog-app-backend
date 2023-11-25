

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const User = require('./models/User.js');
const Post = require('./models/Post.js');
const pdfDetails = require("./models/fileDetails.js");
const app = express();
const bcrypt = require('bcryptjs');
const salt = bcrypt.genSaltSync(10);
const secret = 'thj6^j@#'
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/', limits: { fieldSize: 2 * 1024 * 1024 } });
const fs = require('fs');


app.use(cors({ credentials: true, origin: '*' }));
app.use(express.json());
app.use(cookieParser());
const MONGO_DB_URI = 'Your Mongo db URI'
app.use('/uploads', express.static(__dirname + '/uploads'))

app.use('/files', express.static(__dirname + '/files'))
mongoose.connect('mongodb+srv://blog:blog@cluster0.rhiwtrd.mongodb.net/?retryWrites=true&w=majority')


app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    res.json(userDoc);
  }
  catch (error) {
    console.log(error.message);
    res.status(400).json({ 'error': error.message });
  }


})


app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const userDoc = await User.findOne({
      username,

    });
    const pass_ok = bcrypt.compareSync(password, userDoc.password);
    if (pass_ok) {
 
      jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
        if (err) throw err;
        res.cookie('token', token).json({
          id: userDoc._id,
          username,
        });

      });

    }
    else {
      res.status(400).json('Wrong Credentials');
    }
  }
  catch (error) {
    console.log(error.message);
    res.status(400).json({ 'error': error.message });
  }


})

app.get('/api/profile', (req, res) => {
  
  const { token } = req.cookies;
  console.log(req.cookies);
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) throw err;
    console.log(info)
    res.json(info);
  });

});

app.get('/api/logout', (req, res) => {
  res.cookie('token', '').json('ok');
 
});

app.post('/api/post', uploadMiddleware.single('file'), async (req, res) => {
  const { originalname, path } = req.file;
  const parts = originalname.split('.');
  const ext = parts[parts.length - 1];
  const newPath = path + '.' + ext;
  fs.renameSync(path, newPath);

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;

    const { title, summary, content } = req.body;
    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: newPath,
      author: info.id,
    });

    res.json(postDoc);
  });




});


app.get('/api/post', async (req, res) => {

  res.json(
    await Post.find()
      .populate('author', ['username'])
      .sort({ createdAt: -1 })
      .limit(20)
  );

}
);

app.put('/api/post', uploadMiddleware.single('file'), async (req, res) => {
  let newPath = null;
  if (req.file) {
    const { originalname, path } = req.file;
    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];
    newPath = path + '.' + ext;
    fs.renameSync(path, newPath);
  }

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;
    const { id, title, summary, content } = req.body;
    const postDoc = await Post.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json('you are not the author');
    }
    await postDoc.updateOne({
      title,
      summary,
      content,
      cover: newPath ? newPath : postDoc.cover,
    });

    res.json(postDoc);
  });

});


app.get('/api/post/:id', async (req, res) => {
  const { id } = req.params
  const postdoc = await Post.findById(id).populate('author', ['username']);
  res.json(postdoc);

}

);


app.delete('/api/delete/:id', async (req, res) => {
  const { token } = req.cookies;

  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;

    const { id } = req.params;
    const postDoc = await Post.findById(id);

    // Check if the user is the author of the post
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);

    if (!isAuthor) {
      return res.status(400).json('You are not the author');
    }

    // Remove associated image file
    const imagePath = postDoc.cover;
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    // Delete the post
    const deletedPost = await Post.findByIdAndDelete(id);

    if (deletedPost) {
      res.json({ message: 'Post deleted successfully', deletedPost });
    } else {
      res.status(404).json({ error: "not the author" })
    }
  })
}
);

app.get('/api/post/search/:query', async (req, res) => {
  const { query } = req.params;
  try {
    const searchResults = await Post.aggregate([
      {
        $lookup: {
          from: 'users', // Replace 'users' with the actual name of your users collection
          localField: 'author',
          foreignField: '_id',
          as: 'author_',
        },
      },
      {
        $match: {
          $or: [
            { title: { $regex: new RegExp(query, 'i') } },
            { summary: { $regex: new RegExp(query, 'i') } },
            { content: { $regex: new RegExp(query, 'i') } },
            { 'author.username': { $regex: new RegExp(query, 'i') } },
          ],
        },
      },
      {
        $unwind: '$author_',
      },
      {
        $project: {
          title: 1,
          summary: 1,
          content: 1,
          cover: 1,
          createdAt: 1,
          author: '$author_',
        },
      },
      {
        $sort: { createdAt: -1 },
      }
    ]);

    res.json(searchResults);
  } catch (error) {
    console.error("Error searching posts:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./files");
  },
  filename: function (req, file, cb) {
    const currentDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).replace(/\//g, ''); // Get current date in "ddmmyyyy" format

    const currentTime = new Date().toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/:/g, ''); // Get current time in "hhmm" format

    const parts = file.originalname.split('.');
    const ext = parts[parts.length - 1];
    const newName = `${currentDate}_${currentTime}_${file.originalname.replace(`.${ext}`, `.${ext}`)}`;
    cb(null, newName);
  },
});



const upload = multer({ storage: storage });

app.post("/api/upload-files", upload.single("file"), async (req, res) => {
  const { token } = req.cookies;
  console.log(token)

  console.log(req.file);
  const title = req.body.title;
  const fileName = req.file.filename;
  const content = req.body.content;
  const username_=req.body.username_;
  const accesslevel=req.body.accessLevel;


  try {
    await pdfDetails.create({ title: title, content: content, pdf: fileName,username_: username_ ,accesslevel:accesslevel });
    res.send({ status: "ok" });
  } catch (error) {
    res.json({ status: error });
  }
});

app.get('/api/get-files/:id', async (req, res) => {
  const { id } = req.params
  const postdoc = await pdfDetails.findById(id);
  res.json(postdoc);

}

);

app.get("/api/get-files", async (req, res) => {


  try {
    pdfDetails.find({}).then((data) => {
      res.send({ status: "ok", data: data });
    });
  } catch (error) { }
});



const editFileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./files");
  },
  filename: function (req, file, cb) {
    const currentDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).replace(/\//g, ''); // Get current date in "ddmmyyyy" format

    const currentTime = new Date().toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/:/g, ''); // Get current time in "hhmm" format

 
    const newName = `${currentDate}_${currentTime}_${file.originalname}`;
    cb(null, newName);
  },
});

const editFileUploadMiddleware = multer({ storage: editFileStorage });

app.put('/api/file-edit', editFileUploadMiddleware.single('file'), async (req, res) => {
  let newPath = null;
  if (req.file) {
    console.log(req.file);
    newPath = req.file.filename; // Assuming Multer renames the file for you
  }

  const { id, title, content } = req.body;
  const postFile = await pdfDetails.findById(id);

  await pdfDetails.updateOne({
    title,
    content,
    pdf: newPath ? newPath : postFile.cover,
  });

  res.json(postFile);
});


app.get('/api/delete/:id', async (req, res) => {
  const pdfId = req.params.id;
  console.log("Deleting --> " + pdfId);
  try {
    const deletedPdf = await pdfDetails.findOneAndDelete({ pdf: pdfId });

    if (!deletedPdf) {
      return res.status(404).json({ status: 'error', message: 'PDF not found' });
    }
    const filePath = `./files/${pdfId}`;
    fs.unlinkSync(filePath); // Synchronously remove the file

    return res.json({ status: 'ok', message: 'PDF deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
});

app.get('/', async (req, res) => {
  res.json("Success")

});


app.get('/api/fileupload/search/:query', async (req, res) => {
  const { query } = req.params;
  try {
    const filenameRegex = /(\d{13})(.*)/; 
    const match = query.match(filenameRegex);
    const filenamePart = match ? match[2] : query;
    const searchResults = await pdfDetails.aggregate([
    
      {
        $match: {
          $or: [
            { pdf: { $regex: new RegExp(filenamePart, 'i') } },
            { title: { $regex: new RegExp(query, 'i') } },
            { content: { $regex: new RegExp(query, 'i') } },
            { username_: { $regex: new RegExp(query, 'i') } },
          ],
        },
      },
      
      {
        $project: {
          pdf: 1,
          title: 1,
          content: 1,
          username_: 1,
      
        },
      },
      
    ]);

    res.json(searchResults);
  } catch (error) {
    console.error("Error searching posts:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



app.put("/api/update-access-level/:selectedFileId", async (req, res) => {
  const { selectedFileId } = req.params; // Update the parameter name
  const { accesslevel } = req.body;
  
  try {
    const updatedPdf = await pdfDetails.findOneAndUpdate(
      { _id: selectedFileId }, // Update the parameter name
      { accesslevel: accesslevel },
      { new: true }
    );

    if (!updatedPdf) {
      return res.status(404).json({ status: "error", message: "PDF not found" });
    }

    return res.json({ status: "ok", message: "Access level updated successfully", data: updatedPdf });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
});


app.listen(4001);

//
