import type { MotionAction } from "../MotionPlan";
import { Bones, RigCalibration, type Intensity } from "../RigCalibration";
import type { BoneMap, MotionPrimitive, PositionMap } from "./types";
import { axisQuat, neutral, nlerp, q } from "./math";
import { mergeBones } from "./core";
import { handPose } from "./hands";

export function kneeBendPose(intensity: Intensity): BoneMap {
  return {
    [Bones.rightFootIk]: [...neutral],
    [Bones.rightToeIk]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.rightAnkle]: q(RigCalibration.leg.heelCounter[intensity]),
    [Bones.rightToe]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.rightLegD]: q(RigCalibration.leg.bendThigh[intensity]),
    [Bones.rightKneeD]: q(RigCalibration.leg.bendKnee[intensity]),
    [Bones.rightAnkleD]: q(RigCalibration.leg.ankleCounter[intensity]),
    [Bones.rightFootEx]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.leftFootIk]: [...neutral],
    [Bones.leftToeIk]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.leftAnkle]: q(RigCalibration.leg.heelCounter[intensity]),
    [Bones.leftToe]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.leftLegD]: q(RigCalibration.leg.bendThigh[intensity]),
    [Bones.leftKneeD]: q(RigCalibration.leg.bendKnee[intensity]),
    [Bones.leftAnkleD]: q(RigCalibration.leg.ankleCounter[intensity]),
    [Bones.leftFootEx]: q(RigCalibration.leg.toeGrip[intensity]),
  };
}

export function footBracePositions(intensity: Intensity): PositionMap {
  return {
    [Bones.rightFootIk]: [...RigCalibration.position.rightFootBrace[intensity]],
    [Bones.rightToeIk]: [...RigCalibration.position.rightFootBrace[intensity]],
    [Bones.leftFootIk]: [...RigCalibration.position.leftFootBrace[intensity]],
    [Bones.leftToeIk]: [...RigCalibration.position.leftFootBrace[intensity]],
  };
}

type LearnedCrouchFrame = {
  progress: number;
  center: [number, number, number];
};

type LearnedHandKneeFrame = {
  progress: number;
  upperBody: [number, number, number, number];
  upperBody1: [number, number, number, number];
  upperBody2: [number, number, number, number];
  rightArm: [number, number, number, number];
  rightElbow: [number, number, number, number];
  rightWrist?: [number, number, number, number];
  leftArm: [number, number, number, number];
  leftElbow: [number, number, number, number];
  leftWrist?: [number, number, number, number];
};

type LearnedContactHoldFrame = LearnedHandKneeFrame & {
  center: [number, number, number];
};

export type HandKneeMode = "standing" | "crouched" | "combined";
export type ContactHoldSide = "right" | "left" | "both";

const learnedCrouchFrames: LearnedCrouchFrame[] = [
  { progress: 0, center: [0, -0.03919, 0] },
  { progress: 0.125, center: [0, -0.543197, 0] },
  { progress: 0.25, center: [0, -1.495647, 0] },
  { progress: 0.375, center: [0, -2.737821, 0] },
  { progress: 0.5, center: [0, -4.111001, 0] },
  { progress: 0.625, center: [0, -5.456468, 0] },
  { progress: 0.75, center: [0, -6.615503, 0] },
  { progress: 0.875, center: [0, -7.42939, 0] },
  { progress: 1, center: [0, -7.739408, 0] },
];

const learnedHandKneeHalfFrames: LearnedHandKneeFrame[] = [
  { progress: 0, upperBody: [-0.000080459, 0, 0, 0.999999997], upperBody1: [-0.000823336, 0, 0, 0.999999661], upperBody2: [-0.001147225, 0, 0, 0.999999342], rightArm: [0.000297621, -0.003667377, -0.00070487, 0.999992982], rightElbow: [0.001055062, -0.000594154, 0.000131682, 0.999999258], leftArm: [-0.000476882, 0.003992319, 0.001070172, 0.999991344], leftElbow: [0.000991657, 0.000210658, 0.000258639, 0.999999453], leftWrist: [0.000995964, -0.000422381, 0.000109762, 0.999999409] },
  { progress: 0.125, upperBody: [-0.001049325, 0, 0, 0.999999449], upperBody1: [-0.010744845, 0, 0, 0.999942272], upperBody2: [-0.014982009, 0, 0, 0.999887763], rightArm: [0.003948917, -0.048661693, -0.009352894, 0.99876372], rightElbow: [0.013780469, -0.007760966, 0.001720344, 0.999873445], leftArm: [-0.006360926, 0.053247355, 0.014273715, 0.998459072], leftElbow: [0.012947807, 0.002749999, 0.003376895, 0.99990669], leftWrist: [0.013004628, -0.005515507, 0.001432846, 0.999899198] },
  { progress: 0.25, upperBody: [-0.002850459, 0, 0, 0.999995937], upperBody1: [-0.029217461, 0, 0, 0.999573079], upperBody2: [-0.0407787, 0, 0, 0.999168203], rightArm: [0.011004325, -0.135603489, -0.026063342, 0.990359178], rightElbow: [0.03751794, -0.021129612, 0.004683755, 0.999061563], leftArm: [-0.017868815, 0.149579566, 0.040096844, 0.987774722], leftElbow: [0.035229981, 0.007482486, 0.009188366, 0.999308979], leftWrist: [0.035389313, -0.015009173, 0.003899144, 0.99925328] },
  { progress: 0.375, upperBody: [-0.00519205, 0, 0, 0.999986521], upperBody1: [-0.053260936, 0, 0, 0.998580629], upperBody2: [-0.074392803, 0, 0, 0.997229016], rightArm: [0.020467298, -0.252213167, -0.048476078, 0.966239969], rightElbow: [0.0684581, -0.038554658, 0.008546302, 0.996872102], leftArm: [-0.033467758, 0.280158018, 0.075100157, 0.956426349], leftElbow: [0.064253193, 0.013646731, 0.016757883, 0.997699588], leftWrist: [0.064550564, -0.027376948, 0.007112091, 0.997513481] },
  { progress: 0.5, upperBody: [-0.007782245, 0, 0, 0.999969718], upperBody1: [-0.07984876, 0, 0, 0.99680699], upperBody2: [-0.111553099, 0, 0, 0.993758475], rightArm: [0.030858861, -0.380265568, -0.07308806, 0.921468374], rightElbow: [0.10265962, -0.057816453, 0.012816031, 0.992952169], leftArm: [-0.050562665, 0.423259556, 0.113460511, 0.897452772], leftElbow: [0.096341565, 0.020462014, 0.025126874, 0.994820712], leftWrist: [0.096790193, -0.04105037, 0.010664224, 0.994400724] },
  { progress: 0.625, upperBody: [-0.010316531, 0, 0, 0.999946783], upperBody1: [-0.105802096, 0, 0, 0.994387207], upperBody2: [-0.147744275, 0, 0, 0.989025596], rightArm: [0.040394193, -0.497767194, -0.095672198, 0.861070822], rightElbow: [0.135949054, -0.076564591, 0.016971893, 0.987607044], leftArm: [-0.065899811, 0.551646351, 0.14787634, 0.818215195], leftElbow: [0.127617835, 0.027104739, 0.03328404, 0.990894139], leftWrist: [0.128204164, -0.054373572, 0.014125352, 0.990155382] },
  { progress: 0.75, upperBody: [-0.012494054, 0, 0, 0.999921946], upperBody1: [-0.128014054, 0, 0, 0.991772354], upperBody2: [-0.178599826, 0, 0, 0.983921797], rightArm: [0.047740565, -0.588294318, -0.113071764, 0.799278056], rightElbow: [0.164301835, -0.092532443, 0.020511456, 0.981846187], leftArm: [-0.07726551, 0.64678887, 0.173380521, 0.738670017], leftElbow: [0.15431883, 0.032775771, 0.040247938, 0.986656754], leftWrist: [0.155008423, -0.065741694, 0.01707859, 0.985575335] },
  { progress: 0.875, upperBody: [-0.01402303, 0, 0, 0.999901672], upperBody1: [-0.143543964, 0, 0, 0.989643941], upperBody2: [-0.200083652, 0, 0, 0.979778818], rightArm: [0.052331555, -0.644868081, -0.123945407, 0.752359025], rightElbow: [0.184021318, -0.103638156, 0.022973235, 0.977173228], leftArm: [-0.08408269, 0.703856058, 0.188678259, 0.679644955], leftElbow: [0.172936938, 0.036730076, 0.045103709, 0.983213798], leftWrist: [0.173687923, -0.073664014, 0.019136663, 0.981855339] },
  { progress: 1, upperBody: [-0.014611734, 0, 0, 0.999893243], upperBody1: [-0.149505896, 0, 0, 0.988760834], upperBody2: [-0.208307828, 0, 0, 0.978063315], rightArm: [0.053965779, -0.665006982, -0.127816067, 0.733836809], rightElbow: [0.191564307, -0.107886328, 0.023914916, 0.975239321], leftArm: [-0.086444487, 0.723626238, 0.193977917, 0.656707687], leftElbow: [0.180071166, 0.03824533, 0.046964382, 0.981787155], leftWrist: [0.180842768, -0.076698517, 0.019924998, 0.98031435] },
];

const learnedHandKneeFullFrames: LearnedHandKneeFrame[] = [
  { progress: 0, upperBody: [-0.000172362, 0, 0, 0.999999985], upperBody1: [-0.000342935, 0, 0, 0.999999941], upperBody2: [-0.000388741, 0, 0, 0.999999924], rightArm: [0.001269788, -0.00116694, 0.001223192, 0.999997765], rightElbow: [0.000943765, -0.001149148, 0.000746578, 0.999998616], rightWrist: [-0.00139232, -0.001104541, 0.000118151, 0.999998414], leftArm: [0.001102045, 0.001721628, -0.000710011, 0.999997659], leftElbow: [0.000336006, 0.001213975, -0.000439689, 0.99999911], leftWrist: [0.000416711, 0.000006929, -0.000142276, 0.999999903] },
  { progress: 0.125, upperBody: [-0.002389171, 0, 0, 0.999997146], upperBody1: [-0.004753989, 0, 0, 0.9999887], upperBody2: [-0.005389131, 0, 0, 0.999985479], rightArm: [0.017700098, -0.016265986, 0.017050543, 0.999565607], rightElbow: [0.013126392, -0.015982501, 0.01038308, 0.999732189], rightWrist: [-0.019375322, -0.015370511, 0.001643764, 0.999692774], leftArm: [0.015365894, 0.02400569, -0.009899006, 0.999544709], leftElbow: [0.00466731, 0.016863281, -0.006107853, 0.999828255], leftWrist: [0.00577736, 0.000095625, -0.001972167, 0.999981362] },
  { progress: 0.25, upperBody: [-0.00657871, 0, 0, 0.99997836], upperBody1: [-0.013092431, 0, 0, 0.99991429], upperBody2: [-0.014842466, 0, 0, 0.999889845], rightArm: [0.04914989, -0.045167657, 0.047346081, 0.996645634], rightElbow: [0.03632724, -0.044231645, 0.028735115, 0.997946986], rightWrist: [-0.053663147, -0.042571087, 0.004552728, 0.997640838], leftArm: [0.042686645, 0.066688099, -0.027499554, 0.996480969], leftElbow: [0.012892636, 0.046581981, -0.016871798, 0.998688761], leftWrist: [0.015912928, 0.000263259, -0.005432075, 0.999858591] },
  { progress: 0.375, upperBody: [-0.012043021, 0, 0, 0.99992748], upperBody1: [-0.023969994, 0, 0, 0.999712678], upperBody2: [-0.027175298, 0, 0, 0.999630683], rightArm: [0.090584319, -0.083244967, 0.087259865, 0.988559797], rightElbow: [0.066769732, -0.081298135, 0.052815431, 0.993047303], rightWrist: [-0.098695495, -0.078295312, 0.008373232, 0.991997446], leftArm: [0.078700156, 0.122951072, -0.050700188, 0.987987252], leftElbow: [0.02366119, 0.085489346, -0.030963948, 0.995576694], leftWrist: [0.029137007, 0.000482134, -0.00994623, 0.999525825] },
  { progress: 0.5, upperBody: [-0.01808351, 0, 0, 0.99983648], upperBody1: [-0.035993991, 0, 0, 0.999352006], upperBody2: [-0.040807654, 0, 0, 0.999167021], rightArm: [0.136271911, -0.125230891, 0.131270774, 0.973917437], rightElbow: [0.100370654, -0.122210232, 0.07939404, 0.984218968], rightWrist: [-0.148388334, -0.117716752, 0.012589081, 0.981817286], leftArm: [0.118405442, 0.184981399, -0.076279092, 0.972596285], leftElbow: [0.035553649, 0.128457589, -0.046526916, 0.989984763], leftWrist: [0.043754158, 0.000723968, -0.014935929, 0.998930412] },
  { progress: 0.625, upperBody: [-0.024001396, 0, 0, 0.999711925], upperBody1: [-0.047769726, 0, 0, 0.998858375], upperBody2: [-0.054156769, 0, 0, 0.998532445], rightArm: [0.180160065, -0.16556308, 0.173548211, 0.953945615], rightElbow: [0.132906743, -0.161825786, 0.10513035, 0.972160389], rightWrist: [-0.196417894, -0.155818632, 0.016663857, 0.967916774], leftArm: [0.156507135, 0.244506621, -0.100824987, 0.951607246], leftElbow: [0.047119751, 0.170246523, -0.061662693, 0.982340859], leftWrist: [0.058065129, 0.000960748, -0.019821138, 0.998115545] },
  { progress: 0.75, upperBody: [-0.02909823, 0, 0, 0.999576557], upperBody1: [-0.057905598, 0, 0, 0.998322063], upperBody2: [-0.065644244, 0, 0, 0.99784309], rightArm: [0.216715495, -0.199156697, 0.208762005, 0.932625021], rightElbow: [0.160377591, -0.195273916, 0.12685998, 0.959194282], rightWrist: [-0.23684322, -0.187888102, 0.020093518, 0.952995069], leftArm: [0.188186771, 0.293998841, -0.121233682, 0.929221618], leftElbow: [0.056958095, 0.205792999, -0.074537547, 0.974088893], leftWrist: [0.07037666, 0.001164511, -0.024023831, 0.997230477] },
  { progress: 0.875, upperBody: [-0.032676486, 0, 0, 0.999465981], upperBody1: [-0.065016795, 0, 0, 0.99788417], upperBody2: [-0.07370167, 0, 0, 0.997280334], rightArm: [0.241458896, -0.221895328, 0.232597359, 0.915619208], rightElbow: [0.179248741, -0.218251223, 0.1417872, 0.948753225], rightWrist: [-0.264518876, -0.209843229, 0.022441459, 0.941005826], leftArm: [0.209588696, 0.327434498, -0.135021198, 0.911388229], leftElbow: [0.063771629, 0.230410812, -0.083454018, 0.967408633], leftWrist: [0.079009301, 0.001307362, -0.026970667, 0.996508105] },
  { progress: 1, upperBody: [-0.034039288, 0, 0, 0.999420496], upperBody1: [-0.067723863, 0, 0, 0.997704104], upperBody2: [-0.076768441, 0, 0, 0.997048949], rightArm: [0.250651671, -0.230343237, 0.241452827, 0.908744334], rightElbow: [0.186330237, -0.226873568, 0.147388751, 0.944503035], rightWrist: [-0.274880384, -0.218063022, 0.023320557, 0.936133241], leftArm: [0.217529876, 0.339840654, -0.140136991, 0.904185106], leftElbow: [0.066342595, 0.239699852, -0.08681842, 0.964678808], leftWrist: [0.082294307, 0.001361624, -0.028092063, 0.996211137] },
];

const learnedCrouchedHandKneeFrames: LearnedHandKneeFrame[] = [
  { progress: 0, upperBody: [-0.00009977072477340698, 0.000013614860108646099, -0.000003082165221712785, 1], upperBody1: [-0.00015409103070851415, 2.334634302375724e-19, 3.9407871828882474e-19, 1], upperBody2: [-0.0002642869658302516, 5.228310349939286e-19, 5.998051540756631e-19, 1], rightArm: [-0.000257641077041626, -0.003953948616981506, 0.000014185905456542969, 0.9999921917915344], rightElbow: [-0.00016011297702789307, 0.00010404735803604126, -0.00012668967247009277, 1], leftArm: [0.00004191696643829346, 0.0037714242935180664, -0.00019285082817077637, 0.999992847442627], leftElbow: [-0.00007884204387664795, 0.00039286166429519653, 0.000036716461181640625, 0.9999999403953552] },
  { progress: 0.125, upperBody: [-0.0013011, 0.000177554, -0.000040195, 0.999999137], upperBody1: [-0.002009561, 0, 0, 0.999997981], upperBody2: [-0.003446774, 0, 0, 0.99999406], rightArm: [-0.003426716, -0.052597476, 0.000188425, 0.998609898], rightElbow: [-0.002088097, 0.001356932, -0.001652316, 0.999995534], leftArm: [0.000556066, 0.05005943, -0.002559619, 0.998742806], leftElbow: [-0.001028035, 0.005124158, 0.000479047, 0.999986228] },
  { progress: 0.25, upperBody: [-0.00353444, 0.000482324, -0.00010919, 0.999993632], upperBody1: [-0.005459066, 0, 0, 0.999985099], upperBody2: [-0.009363981, 0, 0, 0.999956157], rightArm: [-0.009586732, -0.147149258, 0.00052717, 0.989067699], rightElbow: [-0.005672586, 0.003686364, -0.004488852, 0.999967041], leftArm: [0.001550419, 0.139571542, -0.007136533, 0.990185059], leftElbow: [-0.002793354, 0.013922868, 0.001301678, 0.999898323] },
  { progress: 0.375, upperBody: [-0.006437931, 0.000878547, -0.000198888, 0.999978871], upperBody1: [-0.009943777, 0, 0, 0.999950559], upperBody2: [-0.017057581, 0, 0, 0.999854509], rightArm: [-0.017891268, -0.274618462, 0.000983821, 0.961386309], rightElbow: [-0.010333048, 0.006715033, -0.008176855, 0.999890632], leftArm: [0.002884875, 0.259709718, -0.013279449, 0.965591112], leftElbow: [-0.005088913, 0.025364815, 0.002371387, 0.999662496] },
  { progress: 0.5, upperBody: [-0.009649671, 0.001316834, -0.000298108, 0.999952529], upperBody1: [-0.014904567, 0, 0, 0.999888921], upperBody2: [-0.025567714, 0, 0, 0.999673093], rightArm: [-0.027001503, -0.414454478, 0.001484811, 0.909668181], rightElbow: [-0.015488209, 0.010065087, -0.012256267, 0.999754266], leftArm: [0.004350089, 0.391618949, -0.020024198, 0.919899292], leftElbow: [-0.007628098, 0.038020679, 0.003554627, 0.999241515] },
  { progress: 0.625, upperBody: [-0.012792045, 0.001745656, -0.000395186, 0.999916577], upperBody1: [-0.019757998, 0, 0, 0.999804792], upperBody2: [-0.033892338, 0, 0, 0.99942549], rightArm: [-0.035270716, -0.541380953, 0.00193954, 0.840035046], rightElbow: [-0.0205313, 0.01334235, -0.016247, 0.999568148], leftArm: [0.005692752, 0.512486923, -0.026204404, 0.858276223], leftElbow: [-0.010111058, 0.050396624, 0.004711697, 0.998666985] },
  { progress: 0.75, upperBody: [-0.015492007, 0.002114104, -0.000478596, 0.999877642], upperBody1: [-0.023927782, 0, 0, 0.99971369], upperBody2: [-0.041042453, 0, 0, 0.999157404], rightArm: [-0.041523462, -0.637355085, 0.002283395, 0.769447259], rightElbow: [-0.024863286, 0.01615754, -0.019675003, 0.999366622], leftArm: [0.006724608, 0.605379918, -0.030954154, 0.795306089], leftElbow: [-0.012242623, 0.061020861, 0.005704987, 0.998045102] },
  { progress: 0.875, upperBody: [-0.017387775, 0.002372808, -0.000537162, 0.999845861], upperBody1: [-0.026855331, 0, 0, 0.999639331], upperBody2: [-0.046061005, 0, 0, 0.998938629], rightArm: [-0.045354571, -0.696158392, 0.002494059, 0.716449744], rightElbow: [-0.027904198, 0.018133623, -0.022081336, 0.999202153], leftArm: [0.007367772, 0.663281939, -0.033914823, 0.747564426], leftElbow: [-0.01373782, 0.06847346, 0.00640173, 0.997537807] },
  { progress: 1, upperBody: [-0.018117692321538925, 0.002472415566444397, -0.0005597114795818925, 0.9998327493667603], upperBody1: [-0.0279824361205101, -3.5098919480043945e-18, 2.1837098746402307e-18, 0.9996084570884705], upperBody2: [-0.0479927584528923, 1.3793203627097234e-17, -8.580663785729002e-18, 0.9988477230072021], rightArm: [-0.046700481325387955, -0.7168185710906982, 0.002568097785115242, 0.6956894397735596], rightElbow: [-0.029074734076857567, 0.018894357606768608, -0.02300766296684742, 0.999133825302124], leftArm: [0.007596384733915329, 0.6838582754135132, -0.03496689721941948, 0.7287368774414062], leftElbow: [-0.014313126914203167, 0.07134097069501877, 0.0066698091104626656, 0.9973270893096924] },
];

const learnedContactHoldFrames: LearnedContactHoldFrame[] = [
  { progress: 0, center: [0, 0, 0], upperBody: [0, 0, 0, 1], upperBody1: [0, 0, 0, 1], upperBody2: [0, 0, 0, 1], rightArm: [-0.01663997769355774, -0.5232288241386414, 0.25905856490135193, 0.8116916418075562], rightElbow: [0, 0, 0, 1], leftArm: [0.06405461579561234, 0.36353087425231934, -0.3214363157749176, 0.8720212578773499], leftElbow: [0, 0, 0, 1] },
  { progress: 0.130435, center: [0, -0.3515525162220001, 0], upperBody: [-0.000844314694404602, 0.00011521904525579885, -0.000026083569537149742, 0.9999996423721313], upperBody1: [-0.00130404531955719, 1.9755984703522488e-18, 3.3349903977443446e-18, 0.9999992251396179], upperBody2: [-0.0022366493940353394, 4.425005995574872e-18, 5.075183191931352e-18, 0.9999975562095642], rightArm: [-0.018088040873408318, -0.5336466431617737, 0.2477540224790573, 0.8084009885787964], rightElbow: [-0.0013549476861953735, 0.0008805766701698303, -0.0010721981525421143, 0.999998152256012], leftArm: [0.06170981004834175, 0.3802229166030884, -0.3095225989818573, 0.8693781495094299], leftElbow: [-0.0006671100854873657, 0.0033249855041503906, 0.0003108382225036621, 0.9999942779541016] },
  { progress: 0.26087, center: [0, -1.272284984588623, 0], upperBody: [-0.003055676817893982, 0.0004169897292740643, -0.0000943991617532447, 0.999995231628418], upperBody1: [-0.004719582386314869, 7.150015211649138e-18, 1.2069942392868575e-17, 0.999988853931427], upperBody2: [-0.008095414377748966, 1.601623001663757e-17, 1.8369300778999817e-17, 0.9999672174453735], rightArm: [-0.021890953183174133, -0.5605195164680481, 0.21760256588459015, 0.798741340637207], rightElbow: [-0.004904123023152351, 0.003186979563906789, -0.0038807555101811886, 0.9999753832817078], leftArm: [0.05534735694527626, 0.42379215359687805, -0.2772020995616913, 0.8605207204818726], leftElbow: [-0.0024148819502443075, 0.012036381289362907, 0.0011252759722992778, 0.9999240636825562] },
  { progress: 0.391304, center: [0, -2.561310291290283, 0], upperBody: [-0.006151638925075531, 0.000839478278066963, -0.00019004312343895435, 0.9999808073043823], upperBody1: [-0.009501575492322445, 1.4394688009515168e-17, 2.4299634868717065e-17, 0.999954879283905], upperBody2: [-0.01629895344376564, 3.2246233282060894e-17, 3.6984300669707485e-17, 0.9998672604560852], rightArm: [-0.027207408100366592, -0.5968820452690125, 0.17428763210773468, 0.7826975584030151], rightElbow: [-0.009873497299849987, 0.006416396703571081, -0.00781320221722126, 0.999900221824646], leftArm: [0.04597261920571327, 0.4837278127670288, -0.22960180044174194, 0.8433130979537964], leftElbow: [-0.004862576723098755, 0.024236515164375305, 0.00226593017578125, 0.9996918439865112] },
  { progress: 0.521739, center: [0, -4.017742156982422, 0], upperBody: [-0.0096496706828475, 0.0013168338919058442, -0.00029810809064656496, 0.999952495098114], upperBody1: [-0.014904571697115898, 2.2580199344821463e-17, 3.8117286645998917e-17, 0.9998889565467834], upperBody2: [-0.025567715987563133, 5.058376205373255e-17, 5.801603941452561e-17, 0.9996731877326965], rightArm: [-0.03313858062028885, -0.6357088088989258, 0.12428797781467438, 0.7611364722251892], rightElbow: [-0.015488194301724434, 0.010065079666674137, -0.012256281450390816, 0.9997543096542358], leftArm: [0.03490298241376877, 0.5485514402389526, -0.17342433333396912, 0.8171886205673218], leftElbow: [-0.00762809906154871, 0.03802068158984184, 0.003554627764970064, 0.9992415904998779] },
  { progress: 0.652174, center: [0, -5.44069242477417, 0], upperBody: [-0.013067148625850677, 0.0017831982113420963, -0.00040368479676544666, 0.9999129772186279], upperBody1: [-0.0201828945428133, 3.0576820678528824e-17, 5.1616377934496797e-17, 0.9997963309288025], upperBody2: [-0.034621015191078186, 6.849514060870669e-17, 7.855899713538614e-17, 0.9994006156921387], rightArm: [-0.03878134489059448, -0.6708284020423889, 0.07496602833271027, 0.7367939352989197], rightElbow: [-0.020972751080989838, 0.013629254885017872, -0.016596397385001183, 0.999549388885498], leftArm: [0.023840932175517082, 0.6074169278144836, -0.11731483042240143, 0.7853111028671265], leftElbow: [-0.01032837014645338, 0.051479678601026535, 0.004812926985323429, 0.9986090660095215] },
  { progress: 0.782609, center: [0, -6.629273891448975, 0], upperBody: [-0.0159215796738863, 0.002172724111005664, -0.0004918666672892869, 0.999870777130127], upperBody1: [-0.024591172114014626, 3.7255238716265554e-17, 6.289013169082287e-17, 0.9996975660324097], upperBody2: [-0.04217979311943054, 8.344963964137937e-17, 9.571085845191409e-17, 0.9991101026535034], rightArm: [-0.04332859814167023, -0.6977351903915405, 0.033875253051519394, 0.7142413258552551], rightElbow: [-0.025552401319146156, 0.016605323180556297, -0.0202203169465065, 0.9993310570716858], leftArm: [0.014603821560740471, 0.6523066163063049, -0.07048222422599792, 0.7545298337936401], leftElbow: [-0.01258154772222042, 0.0627102330327034, 0.005862909369170666, 0.9979352951049805] },
  { progress: 0.913043, center: [0, -7.382600784301758, 0], upperBody: [-0.01773058995604515, 0.0024195900186896324, -0.0005477528320625424, 0.9998398423194885], upperBody1: [-0.027384702116250992, 4.148734288427061e-17, 7.003436490999026e-17, 0.9996249675750732], upperBody2: [-0.046968329697847366, 9.29235112505166e-17, 1.0657651107250855e-16, 0.9988964200019836], rightArm: [-0.04611483961343765, -0.7135598659515381, 0.008058998733758926, 0.699028491973877], rightElbow: [-0.02845400758087635, 0.01849096640944481, -0.022516457363963127, 0.9991704821586609], leftArm: [0.008821986615657806, 0.6784933805465698, -0.04117831215262413, 0.7333984971046448], leftElbow: [-0.014008057303726673, 0.06982037425041199, 0.0065276529639959335, 0.9974399209022522] },
  { progress: 1, center: [0, -7.543806552886963, 0], upperBody: [-0.018117692321538925, 0.0024724160321056843, -0.0005597115377895534, 0.9998327493667603], upperBody1: [-0.027982443571090698, -3.5098919480043945e-18, 2.183716492085131e-18, 0.9996084570884705], upperBody2: [-0.0479927733540535, 1.3793097747978828e-17, -8.580663785729002e-18, 0.9988477230072021], rightArm: [-0.04670063406229019, -0.716818630695343, 0.0025681268889456987, 0.6956892609596252], rightElbow: [-0.029074734076857567, 0.01889435015618801, -0.023007707670331, 0.9991338849067688], leftArm: [0.007596418261528015, 0.6838583946228027, -0.03496690094470978, 0.7287368178367615], leftElbow: [-0.014313113875687122, 0.07134094089269638, 0.006669795140624046, 0.9973270893096924] },
];

function crouchScale(intensity: Intensity) {
  return intensity === "mild" ? 0.43 : intensity === "strong" ? 1.08 : 1;
}

function scaledPosition(values: readonly number[], scale: number): [number, number, number] {
  return [
    (values[0] ?? 0) * scale,
    (values[1] ?? 0) * scale,
    (values[2] ?? 0) * scale,
  ];
}

function scaledQuat(values: readonly number[], scale: number) {
  const converted = [
    -(values[0] ?? 0),
    -(values[1] ?? 0),
    values[2] ?? 0,
    values[3] ?? 1,
  ];

  return nlerp(neutral, q(converted), scale);
}

function handKneeFrames(intensity: Intensity, mode: HandKneeMode) {
  if (mode === "crouched" || mode === "combined") {
    return learnedCrouchedHandKneeFrames;
  }

  return intensity === "mild" ? learnedHandKneeHalfFrames : learnedHandKneeFullFrames;
}

function handKneePose(
  frame: LearnedHandKneeFrame,
  side: "right" | "left" | "both",
  intensity: Intensity
): BoneMap {
  const scale = intensity === "strong" ? 1.04 : 1;
  const torso: BoneMap = {
    [Bones.upperBody]: scaledQuat(frame.upperBody, scale),
    [Bones.upperBody1]: scaledQuat(frame.upperBody1, scale),
    [Bones.upperBody2]: scaledQuat(frame.upperBody2, scale),
  };
  const right: BoneMap = {
    [Bones.rightArm]: scaledQuat(frame.rightArm, scale),
    [Bones.rightElbow]: scaledQuat(frame.rightElbow, scale),
    ...(frame.rightWrist ? { [Bones.rightWrist]: scaledQuat(frame.rightWrist, scale) } : {}),
  };
  const left: BoneMap = {
    [Bones.leftArm]: scaledQuat(frame.leftArm, scale),
    [Bones.leftElbow]: scaledQuat(frame.leftElbow, scale),
    ...(frame.leftWrist ? { [Bones.leftWrist]: scaledQuat(frame.leftWrist, scale) } : {}),
  };

  if (side === "right") {
    return mergeBones(torso, right);
  }

  if (side === "left") {
    return mergeBones(torso, left);
  }

  return mergeBones(torso, right, left);
}

function crouchFramePositions(
  frame: LearnedCrouchFrame,
  intensity: Intensity
): PositionMap {
  return {
    [Bones.center]: scaledPosition(frame.center, crouchScale(intensity)),
  };
}

export function crouchPose(_intensity: Intensity): BoneMap {
  return {};
}

export function crouchPositions(intensity: Intensity): PositionMap {
  return crouchFramePositions(
    learnedCrouchFrames[learnedCrouchFrames.length - 1],
    intensity
  );
}

export function crouchPrimitive(
  intensity: Intensity,
  contactHoldSide?: ContactHoldSide
): MotionPrimitive {
  if (contactHoldSide) {
    return {
      rotationMode: "absolute",
      holdFinalPose: true,
      holdProgress: 1,
      frames: learnedContactHoldFrames.map((frame) => ({
        progress: frame.progress,
        bones: handKneePose(frame, contactHoldSide, intensity),
        positions: crouchFramePositions(frame, intensity),
      })),
    };
  }

  return {
    holdFinalPose: true,
    holdProgress: 1,
    frames: learnedCrouchFrames.map((frame) => ({
      progress: frame.progress,
      bones: {},
      positions: crouchFramePositions(frame, intensity),
    })),
  };
}

export function handOnKneePrimitive(
  side: "right" | "left" | "both",
  intensity: Intensity,
  mode: HandKneeMode = "standing"
): MotionPrimitive {
  return {
    rotationMode: "absolute",
    holdFinalPose: true,
    holdProgress: 1,
    frames: handKneeFrames(intensity, mode).map((frame) => ({
      progress: frame.progress,
      bones: handKneePose(frame, side, intensity),
    })),
  };
}

function runAmount(intensity: Intensity) {
  return intensity === "strong" ? 1.25 : intensity === "mild" ? 0.85 : 1;
}

function runArmSwingPose(
  rightForward: boolean,
  intensity: Intensity,
  swingScale = 1
): BoneMap {
  const amount = runAmount(intensity);
  const forward = -0.36 * amount * swingScale;
  const back = 0.24 * amount * swingScale;
  const tuck = 0.035 * amount;
  const elbow = intensity === "mild" ? "medium" : "strong";

  return {
    [Bones.rightShoulder]: axisQuat(0.015, rightForward ? -tuck : tuck, 0),
    [Bones.leftShoulder]: axisQuat(0.015, rightForward ? -tuck : tuck, 0),
    [Bones.rightArm]: axisQuat(
      rightForward ? forward : back,
      rightForward ? -tuck : tuck,
      rightForward ? 0.025 * amount : -0.018 * amount
    ),
    [Bones.leftArm]: axisQuat(
      rightForward ? back : forward,
      rightForward ? -tuck : tuck,
      rightForward ? 0.018 * amount : -0.025 * amount
    ),
    [Bones.rightElbow]: q(RigCalibration.elbow.bend.right[elbow]),
    [Bones.leftElbow]: q(RigCalibration.elbow.bend.left[elbow]),
    [Bones.rightWrist]: q(RigCalibration.wrist.relaxedRight),
    [Bones.leftWrist]: q(RigCalibration.wrist.relaxedLeft),
    ...handPose("right", "fist"),
    ...handPose("left", "fist"),
  };
}

function runLegPose(
  rightForward: boolean,
  intensity: Intensity,
  strideScale = 1,
  kneeScale = 1
): BoneMap {
  const amount = runAmount(intensity);
  const forwardThigh = -0.42 * amount * strideScale;
  const backThigh = 0.24 * amount * strideScale;
  const liftKnee = 0.52 * amount * kneeScale;
  const pushKnee = 0.22 * amount * (0.75 + kneeScale * 0.25);
  const ankle = 0.18 * amount;
  const toe = 0.16 * amount;

  return {
    [Bones.rightLegD]: axisQuat(
      rightForward ? forwardThigh : backThigh,
      rightForward ? -0.04 : 0.03,
      rightForward ? -0.03 : 0.02
    ),
    [Bones.leftLegD]: axisQuat(
      rightForward ? backThigh : forwardThigh,
      rightForward ? -0.03 : 0.04,
      rightForward ? -0.02 : 0.03
    ),
    [Bones.rightKneeD]: axisQuat(rightForward ? liftKnee : pushKnee, 0, 0),
    [Bones.leftKneeD]: axisQuat(rightForward ? pushKnee : liftKnee, 0, 0),
    [Bones.rightAnkleD]: axisQuat(rightForward ? -ankle * 0.7 : ankle, 0, 0),
    [Bones.leftAnkleD]: axisQuat(rightForward ? ankle : -ankle * 0.7, 0, 0),
    [Bones.rightToe]: axisQuat(rightForward ? toe * 0.4 : toe, 0, 0),
    [Bones.leftToe]: axisQuat(rightForward ? toe : toe * 0.4, 0, 0),
    [Bones.rightFootEx]: axisQuat(rightForward ? toe * 0.35 : toe, 0, 0),
    [Bones.leftFootEx]: axisQuat(rightForward ? toe : toe * 0.35, 0, 0),
  };
}

function runPose(
  rightLegForward: boolean,
  intensity: Intensity,
  strideScale = 1,
  kneeScale = 1,
  bodyScale = 1
): BoneMap {
  const amount = runAmount(intensity);

  return mergeBones(
    {
      [Bones.lowerBody]: axisQuat(0, rightLegForward ? -0.04 : 0.04, 0),
      [Bones.upperBody]: axisQuat(0.12 * amount * bodyScale, rightLegForward ? 0.035 : -0.035, 0),
      [Bones.upperBody1]: axisQuat(0.09 * amount * bodyScale, rightLegForward ? 0.045 : -0.045, 0),
      [Bones.upperBody2]: axisQuat(0.05 * amount * bodyScale, rightLegForward ? 0.05 : -0.05, 0),
      [Bones.head]: axisQuat(-0.04 * amount * bodyScale, rightLegForward ? -0.012 : 0.012, 0),
    },
    runArmSwingPose(!rightLegForward, intensity, strideScale),
    runLegPose(rightLegForward, intensity, strideScale, kneeScale)
  );
}

function runPositions(
  rightLegForward: boolean,
  intensity: Intensity,
  liftScale = 0,
  strideScale = 1,
  dropScale = 1
): PositionMap {
  const amount = runAmount(intensity);
  const stride = 0.38 * amount * strideScale;
  const lateral = 0.07 * amount;
  const lift = 0.13 * amount * liftScale;
  const drop = 0.16 * amount * dropScale - lift * 0.45;

  return {
    [Bones.center]: [
      rightLegForward ? -lateral * 0.35 : lateral * 0.35,
      -drop,
      -0.18 * amount,
    ],
    [Bones.rightFootIk]: [
      rightLegForward ? 0.08 : 0.02,
      lift,
      rightLegForward ? -stride : stride * 0.75,
    ],
    [Bones.rightToeIk]: [
      rightLegForward ? 0.08 : 0.02,
      lift,
      rightLegForward ? -stride : stride * 0.75,
    ],
    [Bones.leftFootIk]: [
      rightLegForward ? -0.02 : -0.08,
      lift,
      rightLegForward ? stride * 0.75 : -stride,
    ],
    [Bones.leftToeIk]: [
      rightLegForward ? -0.02 : -0.08,
      lift,
      rightLegForward ? stride * 0.75 : -stride,
    ],
  };
}

export function runForwardPrimitive(intensity: Intensity): MotionPrimitive {
  const amount = runAmount(intensity);
  const rightContact = runPose(true, intensity);
  const leftContact = runPose(false, intensity);
  const rightCompression = runPose(true, intensity, 0.82, 0.82, 0.9);
  const leftCompression = runPose(false, intensity, 0.82, 0.82, 0.9);
  const rightPassing = runPose(true, intensity, 0.28, 0.55, 0.65);
  const leftPassing = runPose(false, intensity, 0.28, 0.55, 0.65);
  const rightFlight = mergeBones(runPose(true, intensity, 1.05, 1.12, 1), {
    [Bones.rightKneeD]: axisQuat(0.54 * amount, 0, 0),
    [Bones.leftKneeD]: axisQuat(0.34 * amount, 0, 0),
  });
  const leftFlight = mergeBones(runPose(false, intensity, 1.05, 1.12, 1), {
    [Bones.rightKneeD]: axisQuat(0.34 * amount, 0, 0),
    [Bones.leftKneeD]: axisQuat(0.54 * amount, 0, 0),
  });

  return {
    loop: true,
    holdFinalPose: false,
    frames: [
      {
        progress: 0,
        bones: rightContact,
        positions: runPositions(true, intensity, 0, 1, 1),
      },
      {
        progress: 0.12,
        bones: rightCompression,
        positions: runPositions(true, intensity, 0, 0.82, 1.15),
      },
      {
        progress: 0.25,
        bones: rightPassing,
        positions: runPositions(true, intensity, 0.25, 0.32, 0.85),
      },
      {
        progress: 0.38,
        bones: rightFlight,
        positions: runPositions(true, intensity, 1, 1.05, 0.55),
      },
      {
        progress: 0.5,
        bones: leftContact,
        positions: runPositions(false, intensity, 0, 1, 1),
      },
      {
        progress: 0.62,
        bones: leftCompression,
        positions: runPositions(false, intensity, 0, 0.82, 1.15),
      },
      {
        progress: 0.75,
        bones: leftPassing,
        positions: runPositions(false, intensity, 0.25, 0.32, 0.85),
      },
      {
        progress: 0.88,
        bones: leftFlight,
        positions: runPositions(false, intensity, 1, 1.05, 0.55),
      },
      {
        progress: 1,
        bones: rightContact,
        positions: runPositions(true, intensity, 0, 1, 1),
      },
    ],
  };
}

export function stepPose(type: MotionAction["type"], intensity: Intensity): BoneMap {
  const bend = intensity === "mild" ? "mild" : "medium";

  if (type === "step_back") {
    return mergeBones(kneeBendPose(bend), {
      [Bones.rightLegD]: q(RigCalibration.leg.rightStepBack),
      [Bones.leftLegD]: q(RigCalibration.leg.leftStepBack),
      [Bones.rightToe]: q(RigCalibration.leg.toeGrip[bend]),
      [Bones.leftToe]: q(RigCalibration.leg.toeGrip[bend]),
    });
  }

  if (type === "step_left") {
    return mergeBones(kneeBendPose(bend), {
      [Bones.rightLegD]: [-0.12, 0, -0.1, 0.988],
      [Bones.leftLegD]: [-0.08, 0, 0.12, 0.99],
      [Bones.rightFootEx]: [0.08, 0, -0.03, 0.996],
      [Bones.leftFootEx]: [0.08, 0, 0.03, 0.996],
    });
  }

  if (type === "step_right") {
    return mergeBones(kneeBendPose(bend), {
      [Bones.rightLegD]: [-0.08, 0, -0.12, 0.99],
      [Bones.leftLegD]: [-0.12, 0, 0.1, 0.988],
      [Bones.rightFootEx]: [0.08, 0, -0.03, 0.996],
      [Bones.leftFootEx]: [0.08, 0, 0.03, 0.996],
    });
  }

  return mergeBones(kneeBendPose(bend), {
    [Bones.rightLegD]: q(RigCalibration.leg.rightStepForward),
    [Bones.leftLegD]: q(RigCalibration.leg.leftStepForward),
    [Bones.rightToe]: q(RigCalibration.leg.toeGrip[bend]),
    [Bones.leftToe]: q(RigCalibration.leg.toeGrip[bend]),
  });
}

export function stepPositions(
  type: MotionAction["type"],
  intensity: Intensity
): PositionMap {
  const amount = intensity === "strong" ? 0.35 : intensity === "mild" ? 0.14 : 0.24;

  if (type === "step_back") {
    return {
      [Bones.rightFootIk]: [0.08, 0, amount],
      [Bones.rightToeIk]: [0.08, 0, amount],
      [Bones.leftFootIk]: [-0.08, 0, -amount * 0.4],
      [Bones.leftToeIk]: [-0.08, 0, -amount * 0.4],
    };
  }

  if (type === "step_left") {
    return {
      [Bones.rightFootIk]: [amount * 0.3, 0, 0],
      [Bones.rightToeIk]: [amount * 0.3, 0, 0],
      [Bones.leftFootIk]: [-amount, 0, 0],
      [Bones.leftToeIk]: [-amount, 0, 0],
    };
  }

  if (type === "step_right") {
    return {
      [Bones.rightFootIk]: [amount, 0, 0],
      [Bones.rightToeIk]: [amount, 0, 0],
      [Bones.leftFootIk]: [-amount * 0.3, 0, 0],
      [Bones.leftToeIk]: [-amount * 0.3, 0, 0],
    };
  }

  return {
    [Bones.rightFootIk]: [0.08, 0, -amount],
    [Bones.rightToeIk]: [0.08, 0, -amount],
    [Bones.leftFootIk]: [-0.08, 0, amount * 0.4],
    [Bones.leftToeIk]: [-0.08, 0, amount * 0.4],
  };
}
