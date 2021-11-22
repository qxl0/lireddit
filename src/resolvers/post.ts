import { Updoot } from "../entities/Updoot";
import { isAuth } from "../middleware/isAuth";
import {
  Resolver,
  Query,
  Ctx,
  Arg,
  Int,
  Mutation,
  InputType,
  Field,
  FieldResolver,
  Root,
  ObjectType,
  UseMiddleware,
} from "type-graphql";
import { getConnection } from "typeorm";
import { Post } from "../entities/Post";
import { MyContext } from "../types";
import { User } from "../entities/User";

@InputType()
class PostInput {
  @Field()
  title: string;
  @Field()
  text: string;
}

@ObjectType()
class PaginatedPosts {
  @Field(() => [Post])
  posts: Post[];
  @Field()
  hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
  @FieldResolver(() => String)
  textSnippet(@Root() post: Post) {
    return post.text.slice(0, 50);
  }

  @FieldResolver(() => User)
  creator(@Root() post: Post, @Ctx() { userLoader }: MyContext): Promise<User> {
    return userLoader.load(post.creatorId);
  }

  @FieldResolver(() => User)
  async voteStatus(
    @Root() post: Post,
    @Ctx() { updootLoader, req }: MyContext
  ) {
    if (!req.session.userId) {
      return null;
    }

    const updoot = await updootLoader.load({
      postId: post.id,
      userId: req.session.userId,
    });

    return updoot ? updoot.value : null;
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async vote(
    @Arg("postId", () => Int) postId: number,
    @Arg("value", () => Int) value: number,
    @Ctx() { req }: MyContext
  ) {
    const isUpdoot = value !== -1;
    const realValue = isUpdoot ? 1 : -1;
    const { userId } = req.session;

    const updoot = await Updoot.findOne({ where: { postId, userId } });
    if (updoot && updoot.value !== realValue) {
      await getConnection().transaction(async (tm) => {
        await tm.query(
          `
          update updoot
          set value = $1
          where "postId" = $2 and "userId" = $3
        `,
          [realValue, postId, userId]
        );
        await tm.query(
          `
          update post
          set points = points + $1
          where id = $2
        `,
          [2 * realValue, postId]
        );
      });
    } else if (!updoot) {
      // never voted before
      await getConnection().transaction(async (tm) => {
        await tm.query(
          `
          insert into updoot("userId", "postId", "value")
          values ($1, $2, $3)
        `,
          [userId, postId, realValue]
        );

        await tm.query(
          `
          update post
          set points = points + $1
          where id = $2
        `,
          [realValue, postId]
        );
      });
    }
    return true;
  }

  @Query(() => PaginatedPosts)
  async posts(
    @Arg("limit", () => Int) limit: number,
    @Arg("cursor", () => String, { nullable: true }) cursor: string | null,
    @Ctx() { req }: MyContext
  ): Promise<PaginatedPosts> {
    //await sleep(3000);
    const realLimit = Math.min(50, limit);
    const realLimitPlusOne = realLimit + 1;

    const replacements: any[] = [realLimitPlusOne];
    if (req.session.userId) {
      replacements.push(req.session.userId);
    }
    let cursorIdx = 3;
    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
      cursorIdx = replacements.length;
    }

    console.table(replacements);
    const posts = await getConnection().query(
      `
      select p.*,
      ${
        req.session.userId
          ? '(select value from updoot where "userId" = $2 and "postId"=p.id) "voteStatus"'
          : 'null as "voteStatus"'
      } 
      from post p 
      ${cursor ? `where p."createdAt" < $${cursorIdx}` : ""}
      order by p."createdAt" desc
      limit $1
      `,
      replacements
    );
    // const db = getConnection()
    //   .getRepository(Post)
    //   .createQueryBuilder("p")
    //   .innerJoinAndSelect("p.creator", "u", 'u.id = p."creatorId"')
    //   .orderBy('p."createdAt"', "DESC")
    //   .take(realLimitPlusOne);
    // if (cursor) {
    //   db.where('p."createdAt"<:cursor', {
    //     cursor: new Date(parseInt(cursor)),
    //   });
    // }

    // const posts = await db.getMany();
    console.log("posts: ", posts);
    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === realLimitPlusOne,
    };
  }

  @Query(() => Post, { nullable: true })
  post(@Arg("id", () => Int) id: number): Promise<Post | undefined> {
    return Post.findOne(id);
  }

  @Mutation(() => Post)
  async createPost(
    @Arg("input") input: PostInput,
    @Ctx() { req }: MyContext
  ): Promise<Post> {
    console.log("create post: ", req.session);
    if (!req.session.userId) {
      throw new Error("not authenticated!");
    }
    return Post.create({
      ...input,
      creatorId: req.session.userId,
    }).save();
  }

  @Mutation(() => Post, { nullable: true })
  @UseMiddleware(isAuth)
  async updatePost(
    @Arg("id", () => Int) id: number,
    @Arg("title", () => String, { nullable: true }) title: string,
    @Arg("text", () => String, { nullable: true }) text: string,
    @Ctx() { req }: MyContext
  ): Promise<Post | null> {
    const result = await getConnection()
      .createQueryBuilder()
      .update(Post)
      .set({ title, text })
      .where('id = :id and "creatorId" = :creatorId', {
        id,
        creatorId: req.session.userId,
      })
      .returning("*")
      .execute();

    return result.raw[0];
  }
  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg("id", () => Int) id: number,
    @Ctx() { req }: MyContext
  ): Promise<boolean> {
    // method 1. not cascade way
    // const post = await Post.findOne(id);
    // if (!post) {
    //   return false;
    // }
    // if (post.creatorId !== req.session.userId) {
    //   throw new Error("not authorized");
    // }
    // await Updoot.delete({postId: id});
    // await Post.delete({ id, creatorId: req.session.userId });

    // method 2. cascade way
    await Post.delete({ id, creatorId: req.session.userId });
    return true;
  }
}
