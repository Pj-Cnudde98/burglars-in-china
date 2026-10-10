-- Sample trip so the app has something to show. Run after 0001_init.sql.
-- Change the code, PIN and dates before sharing the app with the group.
-- All hotels, tickets and references below are placeholders.

with t as (
  insert into trips (code, name, start_date, end_date, admin_pin_hash)
  values ('DRAGON-27', 'Burglars in China', '2027-04-01', '2027-04-20', crypt('8888', gen_salt('bf')))
  returning id
),
s as (
  insert into stays (trip_id, city, city_zh, name, address_zh, address_en, phone, check_in, check_out, booking_ref, lat, lng)
  select t.id, v.* from t, (values
    ('Beijing','北京','Hutong Courtyard Inn','北京市东城区南锣鼓巷 58 号','58 Nanluoguxiang, Dongcheng District','+86 10 6400 0000','2027-04-01'::date,'2027-04-05'::date,'BK-38122',39.9365,116.4031),
    ('Xi''an','西安','Bell Tower Hotel','西安市碑林区南大街 110 号','110 South Street, Beilin District','+86 29 8760 0000','2027-04-05','2027-04-08','TR-55190',34.2583,108.9466),
    ('Chengdu','成都','Panda Garden Hostel','成都市锦江区春熙路 21 号','21 Chunxi Road, Jinjiang District','+86 28 8666 0000','2027-04-08','2027-04-11','BK-38990',30.6570,104.0817),
    ('Zhangjiajie','张家界','Wulingyuan Mountain Lodge','张家界市武陵源区军地坪街道 8 号','8 Jundiping, Wulingyuan District','+86 744 560 0000','2027-04-11','2027-04-13','AG-11207',29.3460,110.5510),
    ('Guilin','桂林','Yangshuo River View','桂林市阳朔县西街 66 号','66 West Street, Yangshuo County','+86 773 880 0000','2027-04-13','2027-04-16','BK-40021',24.7780,110.4930),
    ('Shanghai','上海','The Bund Loft','上海市黄浦区中山东一路 18 号','18 Zhongshan East 1st Road, Huangpu','+86 21 6321 0000','2027-04-16','2027-04-20','TR-60455',31.2400,121.4900)
  ) as v
  returning 1
),
e as (
  insert into events (trip_id, day, start_time, title, place_zh, kind)
  select t.id, v.day::date, v.tm::time, v.title, v.zh, v.kind from t, (values
    ('2027-04-01','06:40','Land at Beijing Capital (PEK)','北京首都国际机场','travel'),
    ('2027-04-01','10:00','Airport Express to Dongzhimen','机场快轨','travel'),
    ('2027-04-01','18:30','Welcome dinner: Peking duck','四季民福烤鸭店','food'),
    ('2027-04-02','08:30','Tiananmen Square','天安门广场','sight'),
    ('2027-04-02','10:00','Forbidden City','故宫博物院','sight'),
    ('2027-04-02','19:00','Wangfujing snack street','王府井小吃街','food'),
    ('2027-04-03','07:00','Bus to Mutianyu Great Wall','慕田峪长城','travel'),
    ('2027-04-03','09:00','Great Wall hike + toboggan','慕田峪长城','sight'),
    ('2027-04-03','19:30','Hotpot on Gui Jie','簋街','food'),
    ('2027-04-04','09:00','Temple of Heaven','天坛公园','sight'),
    ('2027-04-04','13:00','798 Art District','798艺术区','sight'),
    ('2027-04-05','08:00','G87 high-speed train to Xi''an','北京西站','travel'),
    ('2027-04-05','18:00','Muslim Quarter food walk','回民街','food'),
    ('2027-04-06','08:30','Terracotta Army','秦始皇兵马俑','sight'),
    ('2027-04-06','17:00','Cycle the City Wall','西安城墙','sight'),
    ('2027-04-07','10:00','Big Wild Goose Pagoda','大雁塔','sight'),
    ('2027-04-08','10:15','Flight to Chengdu','咸阳国际机场','travel'),
    ('2027-04-08','19:00','Sichuan hotpot','小龙坎火锅','food'),
    ('2027-04-09','07:30','Giant Panda Base','成都大熊猫繁育研究基地','sight'),
    ('2027-04-10','08:00','Day trip Leshan Buddha','乐山大佛','sight'),
    ('2027-04-11','09:40','Flight to Zhangjiajie','双流国际机场','travel'),
    ('2027-04-12','08:00','Avatar mountains + glass bridge','张家界国家森林公园','sight'),
    ('2027-04-13','09:20','Train to Guilin','张家界西站','travel'),
    ('2027-04-14','09:00','Li River bamboo rafting','漓江竹筏','sight'),
    ('2027-04-15','08:00','Bike the Yulong River','遇龙河','sight'),
    ('2027-04-16','11:05','Flight to Shanghai','两江国际机场','travel'),
    ('2027-04-16','20:00','The Bund at night','外滩','sight'),
    ('2027-04-17','09:30','Yu Garden','豫园','sight'),
    ('2027-04-18','08:30','Zhujiajiao water town','朱家角古镇','sight'),
    ('2027-04-19','19:30','Farewell dinner','','food'),
    ('2027-04-20','09:00','Maglev to Pudong airport','浦东国际机场','travel')
  ) as v(day, tm, title, zh, kind)
  returning 1
)
insert into transport (trip_id, kind, from_place, to_place, from_zh, to_zh, depart_at, arrive_at, code, booking_ref, seat, depart_tz, arrive_tz)
select t.id, v.* from t, (values
  ('flight','Brussels','Beijing','布鲁塞尔','北京','2027-03-31 13:10+02'::timestamptz,'2027-04-01 06:40+08'::timestamptz,'HU492','Q7XK2M','Group booking','Europe/Brussels','Asia/Shanghai'),
  ('train','Beijing West','Xi''an North','北京西','西安北','2027-04-05 08:00+08','2027-04-05 12:24+08','G87','E83310','Car 5','Asia/Shanghai','Asia/Shanghai'),
  ('flight','Xi''an','Chengdu','西安','成都','2027-04-08 10:15+08','2027-04-08 11:45+08','MU2135','L2P9WD','Group booking','Asia/Shanghai','Asia/Shanghai'),
  ('flight','Chengdu','Zhangjiajie','成都','张家界','2027-04-11 09:40+08','2027-04-11 11:10+08','3U8557','M44KQA','Group booking','Asia/Shanghai','Asia/Shanghai'),
  ('train','Zhangjiajie West','Guilin','张家界西','桂林','2027-04-13 09:20+08','2027-04-13 14:05+08','G1607','E91027','Car 3','Asia/Shanghai','Asia/Shanghai'),
  ('flight','Guilin','Shanghai','桂林','上海','2027-04-16 11:05+08','2027-04-16 13:20+08','FM9402','R6T1ZB','Group booking','Asia/Shanghai','Asia/Shanghai'),
  ('flight','Shanghai','Brussels','上海','布鲁塞尔','2027-04-20 13:25+08','2027-04-20 19:50+02','MU551','Q7XK2M','Group booking','Asia/Shanghai','Europe/Brussels')
) as v;
