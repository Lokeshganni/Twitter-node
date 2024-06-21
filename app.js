const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db;
const initialiseDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at PORT 3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
};

initialiseDbAndServer();

// middleware
const middleWare = (req, res, next) => {
  let token;
  const tokenObj = req.headers["authorization"];
  if (tokenObj !== undefined) {
    token = tokenObj.split(" ")[1];
  }
  if (token === undefined) {
    res.status(401).send("Invalid JWT Token");
  } else {
    jwt.verify(token, "secrete-key", (error, payload) => {
      if (error) {
        res.status(401).send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  }
};

// API 1
app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const userVerify = `
  SELECT * FROM user
  WHERE username = '${username}';`;
  const dbUser = await db.get(userVerify);
  if (dbUser !== undefined) {
    res.status(400).send("User already exists");
  } else {
    if (password.length < 6) {
      res.status(400).send("Password is too short");
    } else {
      const hashedPW = await bcrypt.hash(password, 10);
      const insertUserQuery = `
          INSERT INTO user(username,password,name,gender)
          VALUES('${username}','${hashedPW}','${name}','${gender}');`;
      await db.run(insertUserQuery);
      res.status(200).send("User created successfully");
    }
  }
});

// API 2
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const userVerify = `
  SELECT * FROM user
  WHERE username = '${username}';`;
  const dbUser = await db.get(userVerify);

  if (dbUser === undefined) {
    res.status(400).send("Invalid user");
  } else {
    const verifyPW = await bcrypt.compare(password, dbUser.password);
    if (!verifyPW) {
      res.status(400).send("Invalid password");
    } else {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "secrete-key");
      res.send({ jwtToken });
    }
  }
});

// API 3
app.get("/user/tweets/feed/", middleWare, async (req, res) => {
  const getQuery = `
    SELECT
      user.username,
      tweet.tweet,
      tweet.date_time AS dateTime
    FROM
        follower
    INNER JOIN
        tweet ON follower.following_user_id = tweet.user_id
    INNER JOIN
        user ON tweet.user_id = user.user_id
    ORDER BY
        tweet.date_time DESC
    LIMIT 4;`;
  const dbRes = await db.all(getQuery);
  res.send(dbRes);
});

// API 4
app.get("/user/following/", middleWare, async (req, res) => {
  const sqlQuery = `
    SELECT
    user.name
FROM
    follower
INNER JOIN
    user ON follower.following_user_id = user.user_id;`;

  const dbRes = await db.all(sqlQuery);
  res.send(dbRes);
});

// API 5
app.get("/user/followers/", middleWare, async (req, res) => {
  const sqlQuery = `
    SELECT
    user.name
FROM
    follower
INNER JOIN
    user ON follower.follower_user_id = user.user_id;`;
  const dbRes = await db.all(sqlQuery);
  res.send(dbRes);
});

// API 6
app.get("/tweets/:tweetId/", middleWare, async (req, res) => {
  const { tweetId } = req.params;
  const sqlQuery = `
    SELECT * FROM follower 
    JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE tweet.tweet_id = ${tweetId};`;
  const followVerify = await db.get(sqlQuery);
  if (followVerify === undefined) {
    res.status(401).send("Invalid Request");
  } else {
    const tweetDetailsQuery = `
                SELECT
                    tweet.tweet,
                    (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes,
                    (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies,
                    tweet.date_time AS dateTime
                FROM
                    tweet
                WHERE
                    tweet.tweet_id = ${tweetId};
            `;
    const dbRes = await db.get(tweetDetailsQuery);
    res.send(dbRes);
  }
});

// API 7
app.get("/tweets/:tweetId/likes/", middleWare, async (req, res) => {
  const { tweetId } = req.params;
  const sqlQuery = `
    SELECT * FROM follower 
    JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE tweet.tweet_id = ${tweetId};`;
  const followVerify = await db.get(sqlQuery);
  if (followVerify === undefined) {
    res.status(401).send("Invalid Request");
  } else {
    const likesQuery = `SELECT user.username
FROM like
INNER JOIN user ON like.user_id = user.user_id
WHERE like.tweet_id = ${tweetId};`;
    const dbRes = await db.all(likesQuery);
    res.send({ likes: dbRes.map((row) => row.username) });
  }
});

// API 8
app.get("/tweets/:tweetId/replies/", middleWare, async (req, res) => {
  const { tweetId } = req.params;
  const sqlQuery = `
    SELECT * FROM follower 
    JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE tweet.tweet_id = ${tweetId};`;
  const followVerify = await db.get(sqlQuery);
  if (followVerify === undefined) {
    res.status(401).send("Invalid Request");
  } else {
    const repliesQuery = `
                SELECT user.name, reply.reply
                FROM reply
                INNER JOIN user ON reply.user_id = user.user_id
                WHERE reply.tweet_id = ${tweetId};
            `;
    const dbRes = await db.all(repliesQuery);
    res.send({ replies: dbRes });
  }
});

// API 9
app.get("/user/tweets/", middleWare, async (req, res) => {
  const userTweetsQuery = `
        SELECT
            tweet.tweet,
            (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes,
            (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies,
            tweet.date_time AS dateTime
        FROM
            tweet;`;
  const dbRes = await db.all(userTweetsQuery);
  res.send(dbRes);
});

// API 10
app.post("/user/tweets/", middleWare, async (req, res) => {
  const { username } = req;
  const { tweet } = req.body;
  const dateTime = new Date().toISOString().replace("T", " ").replace("Z", "");

  const getUserIdQuery = `
    SELECT user_id FROM user
    WHERE username='${username}';`;
  const getUserIdRes = await db.get(getUserIdQuery);
  const { user_id } = getUserIdRes;

  const insertTweetQuery = `
  INSERT INTO tweet(tweet, user_id, date_time)
  VALUES('${tweet}',${user_id},'${dateTime}');`;
  try {
    await db.run(insertTweetQuery);
    res.send("Created a Tweet");
  } catch (e) {
    console.log(`err :- ${e.message}`);
  }
});

// API 11
app.delete("/tweets/:tweetId/", middleWare, async (req, res) => {
  const { tweetId } = req.params;
  const { username } = req;
  const getUserIdQuery = `
    SELECT user_id FROM user
    WHERE username='${username}';`;
  const getUserIdRes = await db.get(getUserIdQuery);
  const { user_id } = getUserIdRes;
  const checkTweetOwnershipQuery = `
        SELECT 1
        FROM tweet
        WHERE tweet_id = ${tweetId} AND user_id = ${user_id};
    `;
  const verifyUser = await db.get(checkTweetOwnershipQuery);
  if (verifyUser === undefined) {
    res.status(401).send("Invalid Request");
  } else {
    const deleteTweetQuery = `
                DELETE FROM tweet
                WHERE tweet_id = ? AND user_id = ?;
            `;
    await db.run(deleteTweetQuery);
    res.send("Tweet Removed");
  }
});

module.exports = app;
