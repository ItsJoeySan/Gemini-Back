import "dotenv/config";

import express from "express";
import session from "express-session";
import cors from "cors";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { PrismaClient } from "@prisma/client";

const app = express();

const CLIENT_URL = process.env.CLIENT_URL;
const port = process.env.PORT;
const prisma = new PrismaClient();

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.AUTH_SECRET,
    resave: false,
    saveUninitialized: true,
    //cookie is use to store the session time, to decide when the session will expire
    //if cookie will not mention then session expire when we close the browser
    cookie: {
      //1sec * 60s * 60m * 1day
      expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
    },
  })
);

//initialize passport
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },

    //here we are getting user data on profile
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await prisma.user.findFirst({
          where: { googleId: profile.id },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email: profile.emails[0].value,
              name: profile.displayName,
              image: profile.photos[0].value,
            },
          });
        }
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

//we are using this so that when user logs in his user id store in the session
passport.serializeUser((user, done) => {
  return done(null, user.id);
});

//we are using this so that when we have to check if the user in the session is same as the user in db
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
    });
    if (user) {
      return done(null, user);
    } else {
      return done(null, false);
    }
  } catch (error) {
    return done(error, null);
  }
});

//Route to initiate Google OAuth
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

//Google OAuth callback Route
app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    successRedirect: CLIENT_URL,
    //if authentication failed we will redirect them to login route
    failureRedirect: CLIENT_URL, //add a login route here
    failureFlash: true,
  })
);

app.get("/login/success", async (req, res) => {
  if (req.user) {
    res.status(200).json({
      success: true,
      message: "Successfull",
      user: req.user,
    });
  }
});

// app.get("/login/failed", async (req, res) => {
//   res.status(401).json({
//     success: false,
//     message: "failure",
//   });
// });

//this is where we will redirect when we click on "continue with google"
app.get("/logout", (req, res) => {
  req.logout();
  res.redirect(CLIENT_URL);
});

app.use("/user/post", (req, res, next) => {
  req.isAuthenticated();
  next();
});

app.post("/user/post", async (req, res) => {
  //req.body.input is coming from frontend
  await prisma.prompt.create({
    data: {
      prompt: req.body.input,
      author: {
        connect: {
          id: req.user.id,
        },
      },
    },
  });
  res.status(201).json({
    success: true,
    message: "Successfull",
  });
});

//middleware to check if user is authenticated or not
app.use("/posts", (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
});

//if user authenticated we will search all the prompt he send
app.get("/posts", async (req, res) => {
  const allPrompt = await prisma.prompt.findMany({
    where: {
      authorId: req.user.id,
    },
  });

  res.json(allPrompt);
});

app.get("/", (req, res) => {
  res.send("Congrats");
});

app.get("/test", (req, res) => {
  res.send("test successful!");
});

app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
