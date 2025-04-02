import User, { IUser } from './userModel';
import Profile, { IProfile } from './profileModel';
import PlayerData, { IPlayerData } from './playerDataModel';
import ResourceNode, { IResourceNode } from './resourceNodeModel';
import WorldItem, { IWorldItem } from './worldItemModel';
import * as GameModel from './gameModel';

export {
  User,
  IUser,
  Profile,
  IProfile,
  PlayerData,
  IPlayerData,
  ResourceNode,
  IResourceNode,
  WorldItem,
  IWorldItem,
  GameModel
};

// Object with all models for easy access
const models = {
  User,
  Profile,
  PlayerData,
  ResourceNode,
  WorldItem
};

export default models; 